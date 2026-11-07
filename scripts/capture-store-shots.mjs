#!/usr/bin/env node
// 生成微软商店截图（1920×1080）：启动应用 → CDP 切视图 → 逐页截图。
// 用法：node scripts/capture-store-shots.mjs
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'store-assets', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const userData = path.join(root, '.shot-userdata');
fs.rmSync(userData, { recursive: true, force: true });

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; // 否则 electron.exe 会退化成纯 Node

const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const child = spawn(electron, [
  '--remote-debugging-port=9222',
  '--remote-allow-origins=*',
  '--no-sandbox',
  '--disable-gpu',
  `--user-data-dir=${userData}`,
  '.'
], { cwd: root, env, stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitTarget() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* 还没起来 */ }
    await sleep(200);
  }
  throw new Error('CDP 目标未出现（Electron 可能启动失败）');
}

const target = await waitTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await send('Page.enable');
await send('Runtime.enable');
// 商店要求 ≥1366×768 且 16:9。应用按 1220×820 设计，用 1600×900 比 1920×1080 底部留白更少。
await send('Emulation.setDeviceMetricsOverride', {
  width: 1600, height: 900, deviceScaleFactor: 1, mobile: false
});

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error((d.exception && d.exception.description) || d.text || 'evaluate 出错');
  }
  return r.result.value;
}

async function waitFor(expression, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await evaluate(expression)) return; } catch { /* 继续等 */ }
    await sleep(150);
  }
  throw new Error('等待超时：' + expression);
}

async function shot(name) {
  await sleep(650);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(outDir, name);
  const buf = Buffer.from(data, 'base64');
  fs.writeFileSync(file, buf);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  console.log(`saved ${name}  ${w}x${h}  ${(buf.length / 1024).toFixed(0)}KB`);
}

const click = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);

const pressKeys = (count) => evaluate(`(() => {
  const cs = Array.from(document.querySelectorAll('.typing-text .ch')).slice(0, ${count})
    .map((el) => (el.textContent === '\\u00A0' ? ' ' : el.textContent));
  for (const c of cs) window.dispatchEvent(new KeyboardEvent('keydown', { key: c, bubbles: true, cancelable: true }));
  return cs.length;
})()`);

// 统计页需要一点样例数据才好看：直接走应用自己的 IPC 写入隔离的 userData
async function seedStats() {
  const now = Date.now();
  const labels = [
    'S1 认识键盘 · 指法分工入门',
    'S1 认识键盘 · 八个基准键',
    'S2 上排键 · 左手区',
    'S2 上排键 · 右手区',
    '英文字母综合练习',
    '常用单词 · 高频 100'
  ];
  for (let i = 0; i < 26; i += 1) {
    const wpm = 28 + Math.round(Math.sin(i / 5) * 6) + Math.floor(i * 0.8);
    await window.api.appendHistory({
      ts: now - (26 - i) * 7 * 3600 * 1000,
      source: 'section',
      label: labels[i % labels.length],
      sectionId: labels[i % labels.length],
      mode: i % 4 === 0 ? 'free' : 'strict',
      wpm,
      cpm: wpm * 5,
      accuracy: Math.round((93 + Math.random() * 6) * 10) / 10,
      durationMs: 45000 + Math.floor(Math.random() * 60000),
      keystrokes: 220 + Math.floor(Math.random() * 120),
      mistakes: 2 + Math.floor(Math.random() * 8)
    });
  }
  await window.api.saveProgress({
    settings: {},
    sections: {
      'S1 认识键盘 · 指法分工入门': { stars: 3, runs: 6, bestWpm: 46, bestAcc: 99 },
      'S1 认识键盘 · 八个基准键': { stars: 3, runs: 5, bestWpm: 44, bestAcc: 98 },
      'S2 上排键 · 左手区': { stars: 2, runs: 4, bestWpm: 39, bestAcc: 97 },
      'S2 上排键 · 右手区': { stars: 2, runs: 3, bestWpm: 37, bestAcc: 96 },
      '英文字母综合练习': { stars: 1, runs: 2, bestWpm: 33, bestAcc: 95 }
    },
    reaction: {
      best: { lower: { score: 92 }, mixed: { score: 86 }, full: { score: 78 } },
      runs: [
        { ts: now - 86400000, difficulty: 'lower', score: 92, grade: 'S', avg: 612, count: 30 },
        { ts: now - 172800000, difficulty: 'mixed', score: 86, grade: 'A', avg: 668, count: 30 },
        { ts: now - 259200000, difficulty: 'full', score: 78, grade: 'B', avg: 764, count: 30 }
      ]
    }
  });
  return 26;
}

try {
  // 1) 教程：选中第一节，显示课程详情 + 开始按钮
  await waitFor(`!!document.querySelector('.view[data-ready="1"]')`);
  await waitFor(`!!document.querySelector('.tree-item')`);
  await click('.tree-item');
  await waitFor(`!!document.querySelector('[data-act="start"]')`);
  await shot('01-tutorial.png');

  // 2) 打字练习：开始第一节，敲 12 个字符，显示进度/指法/实时数据
  await click('[data-act="start"]');
  await waitFor(`!!document.querySelector('.session .typing-text .ch')`);
  await pressKeys(12);
  await sleep(1300);
  await shot('02-typing.png');
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
  await waitFor(`!document.querySelector('.session')`);

  // 3) 素材练习：点开第一篇素材，展示预览 + 开始练习，避免空态
  await click('.nav-item[data-view="practice"]');
  await waitFor(`!!document.querySelector('.view[data-ready="1"]')`);
  await waitFor(`!!document.querySelector('.mat-item')`);
  await click('.mat-item');
  await waitFor(`!!document.querySelector('.detail-title') || !!document.querySelector('[data-act="start"]')`);
  await shot('03-practice.png');

  // 4) 速度测试：直接开跑并敲几个字符，展示实时 WPM/准确率
  await click('.nav-item[data-view="test"]');
  await waitFor(`!!document.querySelector('#test-dur')`);
  await waitFor(`!!document.querySelector('.view[data-ready="1"]')`);
  await click('[data-act="start"]');
  await waitFor(`!!document.querySelector('.session .typing-text .ch')`);
  await pressKeys(12);
  await sleep(1200);
  await shot('04-test.png');
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
  await waitFor(`!document.querySelector('.session')`);

  // 5) 反应训练：开始训练，等字符出现再截（比空白起始页更有说服力）
  await click('.nav-item[data-view="reaction"]');
  await waitFor(`!!document.querySelector('#rx-count')`);
  await waitFor(`!!document.querySelector('.view[data-ready="1"]')`);
  await click('#rx-start');
  await waitFor(`(() => { const c = document.querySelector('.reaction-char'); return !!c && /^[a-zA-Z]$/.test(c.textContent); })()`, 15000);
  // 稍等再按，得到更真实的反应时间；随后等下一个字符出现，让计数/平均反应有数据
  await sleep(420);
  await evaluate(`(() => { const c = document.querySelector('.reaction-char').textContent; window.dispatchEvent(new KeyboardEvent('keydown', { key: c, bubbles: true, cancelable: true })); return c; })()`);
  await waitFor(`(() => { const d = document.querySelector('#rx-done'); return !!d && d.textContent.startsWith('1'); })()`, 8000);
  await waitFor(`(() => { const c = document.querySelector('.reaction-char'); return !!c && /^[a-zA-Z]$/.test(c.textContent); })()`, 8000);
  await shot('05-reaction.png');

  // 6) 成绩统计（先喂样例数据）
  await evaluate('(' + seedStats.toString() + ')()');
  await click('.nav-item[data-view="stats"]');
  await waitFor(`!!document.querySelector('.summary-cards')`, 20000);
  await shot('06-stats.png');

  console.log('DONE ' + outDir);
} finally {
  try { ws.close(); } catch { /* ignore */ }
  if (process.platform === 'win32') {
    try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* ignore */ }
  } else {
    try { child.kill(); } catch { /* ignore */ }
  }
  await sleep(400);
  fs.rmSync(userData, { recursive: true, force: true });
}
