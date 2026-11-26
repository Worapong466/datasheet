// สร้าง data.json จากโฟลเดอร์ datasheets/ อัตโนมัติ
// รองรับ 2 แบบ:
//   datasheets/<ยี่ห้อ>/<โมเดล>.pdf            -> 1 รุ่น 1 ไฟล์
//   datasheets/<ยี่ห้อ>/<โมเดล>/<ชื่อเอกสาร>.pdf -> 1 รุ่น หลายไฟล์ (เช่น Datasheet, คู่มือ)
import { readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = "datasheets";
const ALLOWED = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);
const collator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });
const byName = (a, b) => collator.compare(a.name, b.name);

const list = (p) =>
  existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((e) => !e.name.startsWith(".")) : [];
const isDoc = (e) => e.isFile() && ALLOWED.has(extname(e.name).toLowerCase());
const doc = (rel) => ({
  name: basename(rel, extname(rel)),
  path: rel,
  size: statSync(join(ROOT, rel)).size,
});

const brands = [];
for (const b of list(join(ROOT, DIR)).filter((e) => e.isDirectory())) {
  const models = [];
  for (const e of list(join(ROOT, DIR, b.name))) {
    if (isDoc(e)) {
      const d = doc(`${DIR}/${b.name}/${e.name}`);
      models.push({ name: d.name, docs: [{ ...d, name: "Datasheet" }] });
    } else if (e.isDirectory()) {
      const docs = list(join(ROOT, DIR, b.name, e.name))
        .filter(isDoc)
        .map((f) => doc(`${DIR}/${b.name}/${e.name}/${f.name}`))
        .sort(byName);
      if (docs.length) models.push({ name: e.name, docs });
    }
  }
  if (models.length) brands.push({ name: b.name, models: models.sort(byName) });
}
brands.sort(byName);

writeFileSync(
  join(ROOT, "data.json"),
  JSON.stringify({ updated: new Date().toISOString(), brands }, null, 2)
);
const n = brands.reduce((s, b) => s + b.models.length, 0);
console.log(`data.json: ${brands.length} brands, ${n} models`);
