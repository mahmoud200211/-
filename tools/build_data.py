# يحوّل ملف Excel (ورقة لكل مسجد) إلى data/students.csv
# الاستخدام:  python3 tools/build_data.py "ملف الأسماء.xlsx"
import sys, csv, re, openpyxl

NO_SUP = "مشرف غير محدد"
src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else "data/students.csv"
wb = openpyxl.load_workbook(src, data_only=True)
rows, seen = [], set()
clean = lambda s: re.sub(r"\s+", " ", str(s or "")).strip()
for ws in wb:
    for r in list(ws.iter_rows(values_only=True))[1:]:
        r = list(r) + [None] * 5
        name, mosque, area, sup = clean(r[1]), clean(r[2]), clean(r[3]), clean(r[4])
        if not name:
            continue
        mosque = mosque or clean(ws.title)
        trainers = [clean(t) for t in re.split(r"[،,]", sup) if clean(t)] or [f"{NO_SUP} - {mosque}"]
        for t in trainers:
            k = (t, mosque, name)
            if k in seen:
                print("تكرار:", k); continue
            seen.add(k)
            rows.append([t, mosque, area, name])
with open(out, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["المدرب", "المسجد", "المنطقة", "الطالب"])
    w.writerows(rows)
print(len(rows), "صف ->", out)
