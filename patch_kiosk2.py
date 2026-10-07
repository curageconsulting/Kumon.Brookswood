"""
patch_kiosk2.py  — fixes walkInCheckOut using 'today' from outer scope
Run from repo root: python patch_kiosk2.py
"""
path = 'app/kiosk/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

original = src

# Fix 1: change walkInCheckOut signature to accept today as a param
old_sig = 'walkInCheckOut(kumonStudentId: string, sessionId: string | null, studentName: string)'
new_sig = 'walkInCheckOut(kumonStudentId: string, sessionId: string | null, studentName: string, today: string)'
if old_sig in src:
    src = src.replace(old_sig, new_sig, 1)
    print("✓ Added 'today' param to walkInCheckOut signature")
else:
    print("WARNING: could not find walkInCheckOut signature — checking for already-patched version")
    if 'today: string' in src:
        print("  Already has today param — skipping sig fix")
    else:
        print("  ERROR: signature not found at all")

# Fix 2: find the call site(s) and pass today there too
# Look for: walkInCheckOut(... ) — the onClick handlers
# Pattern: walkInCheckOut(s.kumonId, s.sessionId, s.name)
old_call = "walkInCheckOut(s.kumonId, s.sessionId, s.name)"
new_call = "walkInCheckOut(s.kumonId, s.sessionId, s.name, today)"
if old_call in src:
    src = src.replace(old_call, new_call)
    print(f"✓ Updated call site: {old_call}")
else:
    # Try other patterns
    import re
    calls = re.findall(r'walkInCheckOut\([^)]+\)', src)
    print(f"Call sites found: {calls}")
    for c in calls:
        if 'today' not in c:
            fixed = c[:-1] + ', today)'
            src = src.replace(c, fixed)
            print(f"✓ Fixed call: {c} → {fixed}")

if src == original:
    print("\nNo changes made — file may already be correct or patterns differ.")
else:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    print(f"\n✓ Kiosk written: {len(src)} bytes")
    print("→ GitHub Desktop: commit 'Fix kiosk checkout today param' → Push origin")
