path = 'app/kiosk/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# Find walkInCheckOut
idx = src.find('walkInCheckOut')
print(src[idx:idx+800])
print("---")
# Find today at component level
idx2 = src.find('export default function KioskPage')
print(src[idx2:idx2+300])
