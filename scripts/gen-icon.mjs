// 生成应用图标 build/icon.png（纯 Node，无第三方依赖）
// 512x512 硬边绘制 → 2x2 降采样得到 256x256 自带抗锯齿
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const BIG = 512;
const OUT = 256;
const buf = Buffer.alloc(BIG * BIG * 4);

function fillRoundRect(rx, ry, rw, rh, rad, color) {
  const [r, g, b] = color;
  const x1 = rx + rw;
  const y1 = ry + rh;
  for (let y = Math.max(0, ry); y < Math.min(BIG, y1); y++) {
    for (let x = Math.max(0, rx); x < Math.min(BIG, x1); x++) {
      const cx = Math.min(Math.max(x + 0.5, rx + rad), x1 - rad);
      const cy = Math.min(Math.max(y + 0.5, ry + rad), y1 - rad);
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > rad * rad) continue;
      const i = (y * BIG + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
}

const ACCENT = [24, 95, 165];
const WHITE = [255, 255, 255];
const AMBER = [240, 168, 50];

// 底板：圆角方块
fillRoundRect(16, 16, 480, 480, 104, ACCENT);

// 键帽网格 4 行 x 5 列，其中一格用琥珀色表示「当前应击键」
const KEY = 74;
const GAP = 22;
const COLS = 5;
const ROWS = 4;
const gridW = COLS * KEY + (COLS - 1) * GAP;
const gridH = ROWS * KEY + (ROWS - 1) * GAP;
const startX = Math.round((BIG - gridW) / 2);
const startY = Math.round((BIG - gridH) / 2);
const highlight = { row: 2, col: 3 };

for (let row = 0; row < ROWS; row += 1) {
  for (let col = 0; col < COLS; col += 1) {
    const isHot = row === highlight.row && col === highlight.col;
    fillRoundRect(
      startX + col * (KEY + GAP),
      startY + row * (KEY + GAP),
      KEY,
      KEY,
      16,
      isHot ? AMBER : WHITE
    );
  }
}

// 降采样 2x2
const small = Buffer.alloc(OUT * OUT * 4);
for (let y = 0; y < OUT; y += 1) {
  for (let x = 0; x < OUT; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const i = ((y * 2 + dy) * BIG + (x * 2 + dx)) * 4;
        r += buf[i];
        g += buf[i + 1];
        b += buf[i + 2];
        a += buf[i + 3];
      }
    }
    const o = (y * OUT + x) * 4;
    small[o] = Math.round(r / 4);
    small[o + 1] = Math.round(g / 4);
    small[o + 2] = Math.round(b / 4);
    small[o + 3] = Math.round(a / 4);
  }
}

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i += 1) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const outDir = path.join(process.cwd(), 'build');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'icon.png');
fs.writeFileSync(outFile, encodePng(OUT, OUT, small));
console.log('icon written:', outFile, fs.statSync(outFile).size, 'bytes');