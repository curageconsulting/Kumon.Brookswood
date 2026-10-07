path = 'app/admin/dashboard/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

old = "supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active')"
new = "supabase.from('kumon_students').select('*', { count: 'exact', head: true }).eq('status', 'active')"

if old in src:
    src = src.replace(old, new, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    print("✓ Dashboard student count now reads from kumon_students")
else:
    # Try to find what's actually there
    idx = src.find('loadStats')
    if idx != -1:
        print("Could not find exact pattern. loadStats context:")
        print(src[idx:idx+600])
    else:
        print("Could not find loadStats — check dashboard manually")
