// สร้าง data.json จากโฟลเดอร์ datasheets/ อัตโนมัติ
// รองรับ 2 แบบ:
//   datasheets/<ยี่ห้อ>/<โมเดล>.pdf            -> 1 รุ่น 1 ไฟล์
//   datasheets/<ยี่ห้อ>/<โมเดล>/<ชื่อเอกสาร>.pdf -> 1 รุ่น หลายไฟล์ (เช่น Datasheet, คู่มือ)
import { readdirSync, statSync, writeFileSync, existsSync, readFileSync } from "node:fs";
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

// ภาพโปรโมชั่น: promos/promos.json กำหนดลำดับ/ลิงก์/ชื่อ (หน้าพนักงานเป็นคนเขียน)
// ภาพที่วางไว้ใน promos/ แต่ไม่อยู่ใน promos.json จะต่อท้ายให้เอง (ลิงก์ = หน้าร้าน)
const PROMO_DIR = "promos";
const IMG = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const promoFiles = list(join(ROOT, PROMO_DIR))
  .filter((e) => e.isFile() && IMG.has(extname(e.name).toLowerCase()))
  .map((e) => e.name);
let promoConfig = [];
try {
  const raw = JSON.parse(readFileSync(join(ROOT, PROMO_DIR, "promos.json"), "utf8").replace(/^﻿/, ""));
  if (Array.isArray(raw)) promoConfig = raw;
} catch {}
const promos = [];
for (const p of promoConfig) {
  if (p && promoFiles.includes(p.file) && !promos.some((x) => x.file === p.file)) {
    promos.push({ file: p.file, image: `${PROMO_DIR}/${p.file}`, title: String(p.title || ""), link: String(p.link || "") });
  }
}
for (const f of promoFiles.sort((a, b) => collator.compare(a, b))) {
  if (!promos.some((x) => x.file === f)) promos.push({ file: f, image: `${PROMO_DIR}/${f}`, title: "", link: "" });
}

writeFileSync(
  join(ROOT, "data.json"),
  JSON.stringify({ updated: new Date().toISOString(), brands, promos }, null, 2)
);
const n = brands.reduce((s, b) => s + b.models.length, 0);
console.log(`data.json: ${brands.length} brands, ${n} models, ${promos.length} promos`);
