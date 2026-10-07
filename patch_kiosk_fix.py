"""
patch_kiosk_fix.py
Fixes: ReferenceError: today is not defined in walkInCheckOut
Run from repo root: python patch_kiosk_fix.py
"""
import re

path = 'app/kiosk/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

original = src

# ── Fix 1: ensure 'today' is defined at component scope ──────────────
# Find the export default function and add today right after the opening brace
# Pattern: looks for the component function opening and first useState
component_open = re.search(r'export default function KioskPage\(\)\s*\{', src)
if not component_open:
    print("ERROR: Could not find KioskPage function")
    exit(1)

pos = component_open.end()
# Check if today is already defined at component scope
snippet = src[pos:pos+400]
if 'const today' in snippet:
    print("'today' already defined at component scope — checking checkout function...")
else:
    # Insert today definition right after the function opening brace
    insert = "\n  const today = new Date().toISOString().split('T')[0]"
    src = src[:pos] + insert + src[pos:]
    print("✓ Added 'today' at component scope")

# ── Fix 2: remove any 'const today' inside walkInCheckOut or load() that shadows it ──
# Replace local 'const today = ...' inside load() with just a reference check
# so we don't have duplicate declarations
load_today = re.findall(r'const today = new Date\(\)\.toISOString\(\)\.split\(.[T].\)\[0\]', src)
print(f"Found {len(load_today)} 'const today' declarations total")

if len(load_today) > 1:
    # Remove the one inside load() — keep only the first (component-level) one
    # Find second occurrence and remove it
    first = src.index("const today = new Date().toISOString().split('T')[0]")
    second = src.index("const today = new Date().toISOString().split('T')[0]", first + 1)
    src = src[:second] + src[second:].replace(
        "const today = new Date().toISOString().split('T')[0]",
        "// today defined at component scope",
        1
    )
    print("✓ Removed duplicate 'today' inside load()")

# ── Fix 3: also remove inside walkInCheckOut if present ──
checkout_match = re.search(r'(async function walkInCheckOut[^{]*\{[^}]*?)(const today[^\n]*\n)', src, re.DOTALL)
if checkout_match:
    src = src[:checkout_match.start(2)] + '  // today defined at component scope\n' + src[checkout_match.end(2):]
    print("✓ Removed 'today' from walkInCheckOut")

if src == original:
    print("No changes needed — 'today' fix already applied or file structure differs.")
    print("Checking if today is referenced in checkout...")
    # Find walkInCheckOut and show context
    m = re.search(r'walkInCheckOut.*?(?=async function|\Z)', src, re.DOTALL)
    if m:
        print(m.group(0)[:300])
else:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    print(f"\n✓ Kiosk fix written: {len(src)} bytes")
    print("Next: GitHub Desktop → commit 'Fix kiosk checkout today scope' → Push origin")
