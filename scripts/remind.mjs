// เตือนรุ่นที่ยังไม่มี Datasheet
// เทียบรายการรุ่นในชีต "Models" ของระบบรับประกัน (อ่านอย่างเดียว) กับไฟล์ใน datasheets/
// แล้วอัปเดต Issue บน GitHub 1 อัน — GitHub จะส่งอีเมลแจ้งเตือนเมื่อมีรุ่นใหม่ที่ยังไม่มีไฟล์
//
// รันในเครื่องเพื่อดูผลโดยไม่แตะ GitHub:  node scripts/remind.mjs   (ไม่มี GITHUB_TOKEN = โหมดทดลอง)
import { readdirSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_URL = process.env.WARRANTY_MODELS_URL ||
  "https://script.google.com/macros/s/AKfycbyAHN_FYWKI2m_Co566TKd86qAp5Yd3J2Ftv8sCaCDogp8Ls-B7YWQ-ET-Cop69WaU/exec?mode=models";
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY || "";
const TITLE = "📋 รุ่นที่ยังไม่มี Datasheet";
const ALLOWED = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);

// ต้องตรงกับ clean() ใน staff.html — ชื่อโฟลเดอร์ที่หน้าพนักงานสร้าง
const clean = (s) => String(s).replace(/[\/\\:*?"<>|#%]+/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
const key = (b, m) => (clean(b) + "|" + clean(m)).toLowerCase();
const coll = new Intl.Collator("th", { numeric: true, sensitivity: "base" });

const [owner, name] = REPO.split("/");
const STAFF_URL = owner ? `https://${owner.toLowerCase()}.github.io/${name}/staff.html` : "staff.html";

// ---------- รุ่นที่มี Datasheet แล้ว ----------
function existingKeys() {
  const dir = join(ROOT, "datasheets");
  const have = new Set();
  if (!existsSync(dir)) return have;
  const list = (p) => readdirSync(p, { withFileTypes: true }).filter((e) => !e.name.startsWith("."));
  for (const b of list(dir).filter((e) => e.isDirectory())) {
    for (const e of list(join(dir, b.name))) {
      if (e.isFile() && ALLOWED.has(extname(e.name).toLowerCase())) {
        have.add(key(b.name, e.name.slice(0, -extname(e.name).length)));
      } else if (e.isDirectory() && list(join(dir, b.name, e.name)).some((f) => f.isFile() && ALLOWED.has(extname(f.name).toLowerCase()))) {
        have.add(key(b.name, e.name));
      }
    }
  }
  return have;
}

// ---------- รุ่นจากระบบรับประกัน ----------
async function warrantyModels() {
  const r = await fetch(MODELS_URL, { redirect: "follow" });
  if (!r.ok) throw new Error(`ดึงรายการรุ่นจากระบบรับประกันไม่ได้ (HTTP ${r.status})`);
  const j = await r.json();
  if (j.status !== "ok" || !j.MODEL_LISTS) throw new Error("รูปแบบข้อมูลจากระบบรับประกันไม่ถูกต้อง");
  const out = [];
  for (const [cat, brands] of Object.entries(j.MODEL_LISTS)) {
    for (const [brand, models] of Object.entries(brands)) {
      for (const model of models) if (String(model).trim()) out.push({ cat, brand, model: String(model).trim() });
    }
  }
  return out;
}

// ---------- GitHub API ----------
async function gh(path, opts = {}) {
  const r = await fetch("https://api.github.com/repos/" + REPO + path, {
    ...opts,
    headers: {
      Authorization: "Bearer " + TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}: ${await r.text()}`);
  return r.json();
}

function buildBody(all, missing, fresh, knownKeys) {
  const date = new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "long" });
  const line = (m) => `- ${m.brand} · ${m.model}`;
  let s = `อัปเดตอัตโนมัติ ${date}\n\n`;
  s += `ยังไม่มี Datasheet **${missing.length} รุ่น** จากทั้งหมด ${all.length} รุ่นในระบบรับประกัน\n\n`;
  s += `👉 อัปโหลดที่หน้าพนักงาน: ${STAFF_URL}\n\n`;
  s += `### 🔴 รุ่นใหม่ที่เพิ่งเพิ่มเข้าระบบรับประกัน (ยังไม่มีไฟล์)\n`;
  s += fresh.length ? fresh.map(line).join("\n") + "\n\n" : "_ไม่มีรุ่นใหม่ตั้งแต่รอบที่แล้ว_\n\n";
  s += `### รายการที่ยังไม่มีทั้งหมด (แยกตามประเภท)\n`;
  const byCat = {};
  for (const m of missing) (byCat[m.cat] ||= []).push(m);
  for (const cat of Object.keys(byCat).sort(coll.compare)) {
    const list = byCat[cat].sort((a, b) => coll.compare(a.brand, b.brand) || coll.compare(a.model, b.model));
    s += `\n<details><summary><b>${cat}</b> (${list.length} รุ่น)</summary>\n\n${list.map(line).join("\n")}\n\n</details>\n`;
  }
  s += `\n_รายการนี้อัปเดตเองทุกวันจันทร์ ไม่ต้องแก้ไขด้วยมือ — อัปโหลดไฟล์ครบแล้วรุ่นนั้นจะหายไปเอง_\n`;
  // จำรายชื่อรุ่นในระบบรับประกันรอบนี้ไว้ เพื่อหารุ่นใหม่ในรอบหน้า
  s += `\n<!-- known:${JSON.stringify([...knownKeys])} -->\n`;
  return s;
}

async function main() {
  const all = await warrantyModels();
  const have = existingKeys();
  const seen = new Set();
  const missing = all.filter((m) => {
    const k = key(m.brand, m.model);
    if (have.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const allKeys = new Set(all.map((m) => key(m.brand, m.model)));

  if (!TOKEN || !REPO) {
    const body = buildBody(all, missing, [], allKeys).replace(/<!-- known:.*-->/s, "<!-- known: ... -->");
    console.log("[โหมดทดลอง — ไม่แตะ GitHub]\n");
    console.log(body);
    return;
  }

  const issues = await gh(`/issues?state=open&per_page=100`);
  const issue = issues.find((i) => i.title === TITLE && !i.pull_request);
  const prevKnown = issue ? JSON.parse((issue.body.match(/<!-- known:(.*?) -->/s) || [, "null"])[1]) : null;
  const fresh = prevKnown ? missing.filter((m) => !prevKnown.includes(key(m.brand, m.model))) : [];
  const body = buildBody(all, missing, fresh, allKeys);

  if (!missing.length) {
    if (issue) {
      await gh(`/issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body: "🎉 ทุกรุ่นในระบบรับประกันมี Datasheet ครบแล้ว — ปิดรายการนี้อัตโนมัติ" }) });
      await gh(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ body, state: "closed" }) });
    }
    console.log("ครบทุกรุ่นแล้ว");
    return;
  }

  if (!issue) {
    const created = await gh(`/issues`, { method: "POST", body: JSON.stringify({ title: TITLE, body }) });
    console.log(`สร้างรายการเตือน #${created.number} (${missing.length} รุ่น)`);
    return;
  }

  await gh(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ body }) });
  // คอมเมนต์ = มีอีเมลเด้ง → ส่งเฉพาะตอนมีรุ่นใหม่ หรือสรุปเดือนละครั้ง (จันทร์แรกของเดือน) กันอีเมลรก
  const firstMondayOfMonth = new Date().getUTCDate() <= 7;
  if (fresh.length || firstMondayOfMonth) {
    const text = fresh.length
      ? `🔴 มีรุ่นใหม่เข้าระบบรับประกัน แต่ยังไม่มี Datasheet ${fresh.length} รุ่น:\n\n${fresh.map((m) => `- ${m.brand} · ${m.model}`).join("\n")}\n\n👉 ${STAFF_URL}`
      : `📅 สรุปประจำเดือน: ยังไม่มี Datasheet ${missing.length} รุ่น — ดูรายการด้านบน\n\n👉 ${STAFF_URL}`;
    await gh(`/issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body: text }) });
  }
  console.log(`อัปเดตรายการเตือน #${issue.number}: ยังไม่มี ${missing.length} รุ่น, รุ่นใหม่ ${fresh.length} รุ่น`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
