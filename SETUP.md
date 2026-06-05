# Kumon Brookswood Portal — Setup Guide

## What you need (all free)
- GitHub account (github.com)
- Supabase account (supabase.com)
- Vercel account (vercel.com)
- Resend account (resend.com)

---

## Step 1 — Set up Supabase (10 min)

1. Go to supabase.com and create a new project
2. Name it "kumon-brookswood", choose a strong password, pick "Canada (Central)" region
3. Wait for the project to start (~2 min)
4. Go to **SQL Editor** in the left sidebar
5. Copy the entire contents of `supabase/migrations/001_initial_schema.sql`
6. Paste it into the SQL editor and click **Run**
7. Go to **Settings > API** and copy:
   - **Project URL** → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
8. Go to **Authentication > Settings** and:
   - Enable "Email confirmations" (so parents verify their email)
   - Set Site URL to your Vercel URL (you'll update this after deploying)

---

## Step 2 — Set up Resend (5 min)

1. Go to resend.com and create a free account
2. Go to **API Keys** and create a new key
3. Copy the key → this is your `RESEND_API_KEY`
4. (Optional) Add and verify your domain for branded emails

---

## Step 3 — Deploy to Vercel (5 min)

1. Go to github.com and create a new repository called `kumon-brookswood`
2. Upload all the files from the `kumon-app` folder to that repo
3. Go to vercel.com and click **Add New Project**
4. Import your GitHub repository
5. Before clicking Deploy, click **Environment Variables** and add:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = (from Supabase step)
   NEXT_PUBLIC_SUPABASE_ANON_KEY = (from Supabase step)
   RESEND_API_KEY               = (from Resend step)
   NEXT_PUBLIC_APP_URL          = https://your-app.vercel.app (your Vercel URL)
   ```
6. Click **Deploy**
7. Your app will be live at `https://your-project.vercel.app`

---

## Step 4 — Create the admin account

1. Go to your live site and click "Create an account"
2. Sign up with your email
3. In Supabase, go to **Table Editor > profiles**
4. Find your email row and change `role` from `parent` to `admin`
5. Sign out and sign back in — you'll now see the admin dashboard

---

## Step 5 — First time setup in the app

1. Sign in as admin
2. Go to **Schedules > Manage academic year** → Create 2026–2027
3. Go to **Students** → Add your first student (assign to parent's account)
4. Go to **Schedules** → Create a recurring schedule for that student (picks 2 days/times)
5. Sessions are automatically generated for the whole academic year!

---

## Future updates

Whenever you need to update the app, just push changes to GitHub —
Vercel automatically redeploys within ~1 minute.

---

## Support

If you get stuck, the key resources are:
- Supabase docs: docs.supabase.com
- Vercel docs: vercel.com/docs
- Next.js docs: nextjs.org/docs
