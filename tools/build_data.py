# يحوّل ملف Excel (ورقة لكل مسجد) إلى data/students.csv
# الاستخدام:  python3 tools/build_data.py "ملف الأسماء.xlsx"
# الأعمدة الناتجة: المسجد، المنطقة، الطالب، المشرف (عدة مشرفين تُفصل بـ |)
import sys, csv, re, openpyxl

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else "data/students.csv"
wb = openpyxl.load_workbook(src, data_only=True)
clean = lambda s: re.sub(r"\s+", " ", str(s or "")).strip()
rows = {}
for ws in wb:
    for r in list(ws.iter_rows(values_only=True))[1:]:
        r = list(r) + [None] * 5
        name, mosque, area, sup = clean(r[1]), clean(r[2]), clean(r[3]), clean(r[4])
        if not name:
            continue
        mosque = mosque or clean(ws.title)
        item = rows.setdefault((mosque, name), {"area": area, "sups": []})
        for s in re.split(r"[،,]", sup):
            if clean(s) and clean(s) not in item["sups"]:
                item["sups"].append(clean(s))
with open(out, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["المسجد", "المنطقة", "الطالب", "المشرف"])
    for (m, n), v in rows.items():
        w.writerow([m, v["area"], n, "|".join(v["sups"])])
print(len(rows), "طالب ->", out)
