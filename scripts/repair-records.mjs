// 修复被自动化测试污染的练习记录
//  1) 剔除异常成绩（WPM > 1000 或用时 < 1.5s —— 人类不可能达到）
//  2) 给历史记录补上 sectionId
//  3) 按干净记录重算每节课的星级 / 练习次数 / 最佳成绩
// 用法：node scripts/repair-records.mjs
import fs from 'node:fs';
import path from 'node:path';

const appdata = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
const dir = path.join(appdata, 'typingpractice', 'user-data');
const histPath = path.join(dir, 'history.json');
const progPath = path.join(dir, 'progress.json');
const curPath = path.join(process.cwd(), 'data', 'curriculum.json');

if (!fs.existsSync(histPath) || !fs.existsSync(progPath)) {
  console.error('找不到用户数据文件：', dir);
  process.exit(1);
}

const stamp = new Date().toISOString().slice(0, 10);
fs.copyFileSync(histPath, `${histPath}.bak-${stamp}`);
fs.copyFileSync(progPath, `${progPath}.bak-${stamp}`);

const curriculum = JSON.parse(fs.readFileSync(curPath, 'utf8'));
const labelToId = new Map();
for (const stage of curriculum.stages) {
  for (const sec of stage.sections) labelToId.set(`${stage.name} · ${sec.name}`, sec.id);
}

const thresholds = curriculum.starThresholds || {};
const history = JSON.parse(fs.readFileSync(histPath, 'utf8'));
const clean = history.filter((r) => (r.wpm || 0) <= 1000 && (r.durationMs || 0) >= 1500);
for (const r of clean) {
  if (!r.sectionId) r.sectionId = labelToId.get(r.label) || null;
}
fs.writeFileSync(histPath, `${JSON.stringify(clean, null, 2)}\n`);

const sections = {};
for (const r of clean) {
  if (!r.sectionId) continue;
  const s = sections[r.sectionId] || { stars: 0, runs: 0, bestWpm: 0, bestAcc: 0 };
  s.runs += 1;
  s.bestWpm = Math.max(s.bestWpm, r.wpm || 0);
  s.bestAcc = Math.max(s.bestAcc, r.accuracy || 0);
  let stars = 1;
  if (thresholds.two && r.wpm >= thresholds.two.wpm && r.accuracy >= thresholds.two.accuracy) stars = 2;
  if (thresholds.three && r.wpm >= thresholds.three.wpm && r.accuracy >= thresholds.three.accuracy) stars = 3;
  s.stars = Math.max(s.stars, stars);
  sections[r.sectionId] = s;
}

const progress = JSON.parse(fs.readFileSync(progPath, 'utf8'));
progress.sections = sections;
fs.writeFileSync(progPath, `${JSON.stringify(progress, null, 2)}\n`);

console.log(`history: ${history.length} → ${clean.length} 条（剔除 ${history.length - clean.length} 条异常）`);
console.log(`sections: 重算 ${Object.keys(sections).length} 节课`);
for (const [id, s] of Object.entries(sections)) {
  console.log(`  ${id}: ${s.stars}星 / ${s.runs}次 / 最佳 ${s.bestWpm} WPM / ${s.bestAcc}%`);
}
console.log(`备份：${histPath}.bak-${stamp}、${progPath}.bak-${stamp}`);
