// 在线素材源适配层（主进程）
//
// 把第三方公开 API 的返回「翻译」成应用能直接导入的素材：
//   words   —— 单词数组，导入后进「词库」tab
//   article —— 整段文本，导入后进「文章」tab
//
// 只允许访问白名单域名，避免这个 IPC 退化成任意 URL 抓取器（SSRF）。
// 三个源都是免费、无需 API Key、且实测国内可直连的：
//   api.datamuse.com       主题相关词（快）
//   tatoeba.org            英文例句（稍慢，约 5s）
//   raw.githubusercontent  Google 10000 高频词表（快）

const { net } = require('electron');

const TIMEOUT_MS = 15000;
const UA = 'TypingPractice/1.1 (educational typing app)';
const FREQ_LIST_URL = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt';

const ALLOWED_HOSTS = new Set([
  'api.datamuse.com',
  'tatoeba.org',
  'raw.githubusercontent.com'
]);

let freqCache = null;

async function fetchText(url) {
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(host)) throw new Error(`不允许的来源域名：${host}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await net.fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`请求失败（HTTP ${res.status}）`);
    return await res.text();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`请求超时（${TIMEOUT_MS / 1000} 秒）`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// 去 HTML 标签、解常见实体、折叠空白：第三方文本基本都要过一遍
function cleanText(input) {
  return String(input || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&mdash;/g, '-')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 只保留纯 ASCII 可打印字符（中文/特殊符号会让练习无法输入）
function isTypable(text) {
  return /^[\x20-\x7E]+$/.test(text);
}

// ① Datamuse：主题词 → 相关词
async function searchTopicWords(query) {
  const url = `https://api.datamuse.com/words?ml=${encodeURIComponent(query)}&max=150`;
  const list = JSON.parse(await fetchText(url));
  const seen = new Set();
  const words = [];
  for (const item of list) {
    const w = cleanText(item.word).toLowerCase();
    if (!w || w.length < 2 || w.length > 20) continue;
    if (!/^[a-z][a-z '-]*$/.test(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    words.push(w);
  }
  if (!words.length) {
    return { ok: true, items: [], message: `没找到与「${query}」相关的词，换个主题词试试` };
  }
  return {
    ok: true,
    items: [{
      id: `topic:${query}`,
      title: `${query} 相关词`,
      meta: `${words.length} 词 · Datamuse`,
      kind: 'words',
      name: `${query} 相关词`,
      words,
      preview: words.slice(0, 40).join(' · ')
    }]
  };
}

// 例句源的内容来自开放语料库，先挡掉明显的脏话/不雅词
const BAD_WORDS = /\b(fuck\w*|shit\w*|bitch\w*|bastard|damn|dick|cock|pussy|whore|slut|rape\w*|porn\w*|nigg\w*|faggot|asshole|crap|piss)\b/i;

// 词集合相似度：用来去掉 "I played music." / "She played music." 这类模板重复句
function tokenSet(text) {
  return new Set(text.toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean));
}

function similar(a, b, threshold = 0.45) {
  const A = a.size;
  const B = b.size;
  if (!A || !B) return false;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (A + B - inter) >= threshold;
}

// ② Tatoeba：关键词 → 英文例句（拼成一段文章，每句一行）
// 这个 API 每次固定只返回 10 条，所以并发拉 3 页凑够量；总耗时约等于单页（~8s）
async function searchSentences(query) {
  const pages = [1, 2, 3];
  const batches = await Promise.all(pages.map(async (page) => {
    const url = `https://tatoeba.org/en/api_v0/search?from=eng&query=${encodeURIComponent(query)}&orphans=no&unapproved=no&sort=relevance&page=${page}`;
    try {
      const data = JSON.parse(await fetchText(url));
      return Array.isArray(data.results) ? data.results.map((r) => r.text) : [];
    } catch {
      return []; // 某一页失败不影响其它页
    }
  }));

  const pool = batches.flat();
  const chosen = [];
  const seenText = new Set();
  const usedTokens = [];

  // 同一批语料跑两轮：先按 0.45 去重（挡模板变体），句子太少再放宽到 0.75 补足长度
  const collect = (threshold) => {
    for (const raw of pool) {
      if (chosen.length >= 30) break;
      const s = cleanText(raw);
      // 太短（"Music unites."）或太长都不适合练；要求含空格且以句末标点收尾，可读性更好
      if (!s || s.length < 15 || s.length > 160 || !isTypable(s)) continue;
      if (!/\s/.test(s) || !/[.!?]"?$/.test(s)) continue;
      if (BAD_WORDS.test(s)) continue;
      if (seenText.has(s)) continue;
      const toks = tokenSet(s);
      if (usedTokens.some((t) => similar(t, toks, threshold))) continue;
      seenText.add(s);
      usedTokens.push(toks);
      chosen.push(s);
    }
  };
  collect(0.45);
  if (chosen.length < 12) collect(0.75);

  if (!chosen.length) {
    return { ok: true, items: [], message: `没找到含「${query}」的合适例句，换个关键词试试` };
  }
  // 打乱顺序：语料按相关度排序，同一主题的句子会扎堆
  for (let i = chosen.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return {
    ok: true,
    items: [{
      id: `sent:${query}`,
      title: `含 ${query} 的例句`,
      meta: `${chosen.length} 句 · Tatoeba`,
      kind: 'article',
      name: `例句 · ${query}`,
      text: chosen.join('\n'),
      preview: chosen.slice(0, 3).join(' ')
    }]
  };
}

// ③ Google 10000 高频词表：按关键词过滤（前缀优先，其次包含）
async function loadFreqWords() {
  if (freqCache) return freqCache;
  const text = await fetchText(FREQ_LIST_URL);
  freqCache = text.split('\n').map((s) => s.trim().toLowerCase()).filter((w) => /^[a-z]+$/.test(w));
  return freqCache;
}

async function searchFreqWords(query) {
  const all = await loadFreqWords();
  const q = query.toLowerCase();
  let words;
  if (!q) {
    words = all.slice(0, 200);
  } else {
    const prefix = all.filter((w) => w.startsWith(q));
    const contain = all.filter((w) => !w.startsWith(q) && w.includes(q));
    words = [...prefix, ...contain].slice(0, 300);
  }
  if (!words.length) {
    return { ok: true, items: [], message: `高频词表里没有含「${query}」的词` };
  }
  const label = q ? `含 ${q}` : '前 200';
  return {
    ok: true,
    items: [{
      id: `freq:${q || 'all'}`,
      title: `高频词 · ${label}`,
      meta: `${words.length} 词 · Google 10000`,
      kind: 'words',
      name: `高频词 · ${label}`,
      words,
      preview: words.slice(0, 40).join(' · ')
    }]
  };
}

const SOURCES = {
  words: { label: '主题词库', needQuery: true, run: searchTopicWords },
  sentences: { label: '例句短文', needQuery: true, run: searchSentences },
  freq: { label: '高频词表', needQuery: false, run: searchFreqWords }
};

async function searchOnline({ source, query } = {}) {
  const def = SOURCES[source];
  if (!def) return { ok: false, message: '未知的素材来源' };
  const q = String(query || '').trim();
  if (def.needQuery && !q) {
    return { ok: false, message: `「${def.label}」需要先填关键词` };
  }
  try {
    return await def.run(q);
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  }
}

// 冒烟测试专用：不联网，返回固定结果，保证离线也能验证界面链路
function mockSearch({ source, query } = {}) {
  const q = String(query || 'smoke').trim() || 'smoke';
  if (source === 'sentences') {
    return {
      ok: true,
      items: [{
        id: 'mock-sent',
        title: `含 ${q} 的例句`,
        meta: '3 句 · 模拟源',
        kind: 'article',
        name: `例句 · ${q}`,
        text: 'The quick brown fox jumps over the lazy dog.\nPack my box with five dozen liquor jugs.\nHow vexingly quick daft zebras jump!',
        preview: 'The quick brown fox jumps over the lazy dog.'
      }]
    };
  }
  const words = ['alpha', 'beta', 'gamma', 'delta'];
  return {
    ok: true,
    items: [{
      id: `mock-${source || 'words'}`,
      title: `${q} 相关词`,
      meta: `${words.length} 词 · 模拟源`,
      kind: 'words',
      name: `${q} 相关词`,
      words,
      preview: words.join(' · ')
    }]
  };
}

module.exports = { searchOnline, mockSearch, SOURCES };
