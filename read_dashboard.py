path = 'app/admin/dashboard/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()
print(f"Total chars: {len(src)}")
# Show first 3000 to understand structure
print(src[:3000])
