-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Enums
create type user_role as enum ('admin', 'parent');
create type student_category as enum ('early_learner', 'main');
create type student_subject as enum ('math', 'reading', 'both');
create type student_status as enum ('active', 'archived');
create type day_of_week as enum ('monday', 'thursday', 'friday', 'saturday');
create type session_status as enum ('scheduled', 'cancelled', 'makeup');

-- Profiles (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'parent',
  first_name text not null,
  last_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- Academic years
create table academic_years (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

-- Students
create table students (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid not null references profiles(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  category student_category not null,
  subjects student_subject not null,
  kumon_level text,
  status student_status not null default 'active',
  created_at timestamptz not null default now()
);

-- Recurring schedules
create table recurring_schedules (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  day_of_week day_of_week not null,
  start_time time not null,
  duration_mins integer not null,
  academic_year_id uuid not null references academic_years(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Individual sessions (generated from recurring schedules)
create table sessions (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  schedule_id uuid references recurring_schedules(id) on delete set null,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  duration_mins integer not null,
  status session_status not null default 'scheduled',
  makeup_for_id uuid references sessions(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Cancellations log
create table cancellations (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  cancelled_by uuid not null references profiles(id),
  reason text,
  cancelled_at timestamptz not null default now()
);

-- Indexes
create index idx_students_parent on students(parent_id);
create index idx_sessions_student on sessions(student_id);
create index idx_sessions_date on sessions(session_date);
create index idx_sessions_status on sessions(status);
create index idx_recurring_student on recurring_schedules(student_id);

-- View: slot capacity
create or replace view slot_capacity as
select
  s.session_date,
  s.start_time,
  st.category,
  count(*) as booked_count,
  case when st.category = 'early_learner' then 6 else 15 end as max_capacity,
  case when st.category = 'early_learner' then 6 else 15 end - count(*) as available
from sessions s
join students st on s.student_id = st.id
where s.status = 'scheduled'
group by s.session_date, s.start_time, st.category;

-- Row Level Security
alter table profiles enable row level security;
alter table students enable row level security;
alter table recurring_schedules enable row level security;
alter table sessions enable row level security;
alter table cancellations enable row level security;
alter table academic_years enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);
create policy "Admins can view all profiles"
  on profiles for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Students policies
create policy "Parents can view own students"
  on students for select using (parent_id = auth.uid());
create policy "Admins can do everything with students"
  on students for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Sessions policies
create policy "Parents can view own sessions"
  on sessions for select using (
    student_id in (select id from students where parent_id = auth.uid())
  );
create policy "Admins can do everything with sessions"
  on sessions for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
create policy "Parents can update own sessions (cancel)"
  on sessions for update using (
    student_id in (select id from students where parent_id = auth.uid())
  );

-- Cancellations policies
create policy "Parents can insert own cancellations"
  on cancellations for insert with check (cancelled_by = auth.uid());
create policy "Parents can view own cancellations"
  on cancellations for select using (cancelled_by = auth.uid());
create policy "Admins can view all cancellations"
  on cancellations for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Recurring schedules policies
create policy "Parents can view own schedules"
  on recurring_schedules for select using (
    student_id in (select id from students where parent_id = auth.uid())
  );
create policy "Admins can do everything with schedules"
  on recurring_schedules for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Academic years - everyone can read
create policy "Anyone can view academic years"
  on academic_years for select using (true);
create policy "Admins can manage academic years"
  on academic_years for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Function: auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, role, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'parent')::user_role,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Function: generate sessions from a recurring schedule
create or replace function generate_sessions_from_schedule(schedule_id uuid)
returns void language plpgsql as $$
declare
  sched recurring_schedules%rowtype;
  yr academic_years%rowtype;
  student students%rowtype;
  cur_date date;
  target_dow integer;
  end_time time;
begin
  select * into sched from recurring_schedules where id = schedule_id;
  select * into yr from academic_years where id = sched.academic_year_id;
  select * into student from students where id = sched.student_id;
  end_time := sched.start_time + (sched.duration_mins || ' minutes')::interval;
  target_dow := case sched.day_of_week
    when 'monday' then 1
    when 'thursday' then 4
    when 'friday' then 5
    when 'saturday' then 6
  end;
  cur_date := yr.start_date;
  while cur_date <= yr.end_date loop
    if extract(isodow from cur_date) = target_dow then
      insert into sessions (student_id, schedule_id, session_date, start_time, end_time, duration_mins, status)
      values (sched.student_id, schedule_id, cur_date, sched.start_time, end_time, sched.duration_mins, 'scheduled')
      on conflict do nothing;
    end if;
    cur_date := cur_date + 1;
  end loop;
end;
$$;
