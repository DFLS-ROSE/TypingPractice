// 大模型素材生成（主进程）
//
// 用户自己在「设置」里填 API 地址 / 模型 / Key，走 OpenAI 兼容的
// /chat/completions 接口，所以 DeepSeek、通义、Kimi、智谱、OpenAI 等都能用。
//
// 安全约定：
//   - API Key 用 Electron safeStorage（Windows 上是 DPAPI，绑定当前用户）加密后落盘，
//     配置文件里存的是 base64 密文；取不到加密能力时才退回明文并加标记
//   - Key 只在主进程使用，渲染层通过与主进程的 IPC 交互，不直接持有（回填输入框除外）
//   - 地址只接受 http(s)，避免被用来读本地文件

const { app, net, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const CONFIG_FILE = 'ai-config.json';
const TIMEOUT_MS = 60000;

function configPath() {
  const dir = path.join(app.getPath('userData'), 'user-data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, CONFIG_FILE);
}

function readRaw() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8')) || {};
  } catch {
    return {};
  }
}

function encryptKey(plain) {
  if (!plain) return '';
  if (safeStorage.isEncryptionAvailable()) {
    return `enc:${safeStorage.encryptString(plain).toString('base64')}`;
  }
  return `plain:${plain}`;
}

function decryptKey(stored) {
  if (!stored) return '';
  if (stored.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    } catch {
      return ''; // 换机器 / 系统凭据失效时解不开，当作未配置
    }
  }
  return stored.replace(/^plain:/, '');
}

function loadConfig() {
  const raw = readRaw();
  const stored = String(raw.apiKey || '');
  return {
    baseUrl: String(raw.baseUrl || ''),
    model: String(raw.model || ''),
    apiKey: decryptKey(stored),
    keyEncrypted: stored.startsWith('enc:')
  };
}

function saveConfig({ baseUrl, model, apiKey }) {
  const raw = readRaw();
  const nextKey = String(apiKey || '').trim();
  const next = {
    ...raw,
    baseUrl: String(baseUrl || '').trim(),
    model: String(model || '').trim(),
    // 空值表示「不修改」，避免用户只想改模型时把 Key 清掉
    apiKey: nextKey ? encryptKey(nextKey) : String(raw.apiKey || '')
  };
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  return { ok: true, keyEncrypted: String(next.apiKey || '').startsWith('enc:') };
}

// 用户可能填 https://api.deepseek.com、.../v1 或完整的 .../v1/chat/completions
function endpointOf(baseUrl) {
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('还没填 API 地址');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('API 地址格式不对，应该像 https://api.deepseek.com/v1');
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('API 地址只能是 http 或 https');
  if (/\/chat\/completions$/.test(raw)) return raw;
  if (/\/v\d+$/.test(raw)) return `${raw}/chat/completions`;
  return `${raw}/v1/chat/completions`;
}

async function chat(config, messages, { maxTokens = 800, temperature = 0.7 } = {}) {
  const url = endpointOf(config.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await net.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 200);
      try {
        const j = JSON.parse(text);
        detail = (j.error && j.error.message) || j.message || detail;
      } catch { /* 保持原始文本 */ }
      throw new Error(`HTTP ${res.status}：${detail}`);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('接口返回的不是 JSON，确认地址是 OpenAI 兼容的 /chat/completions');
    }
    const content = json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content
      : '';
    if (!content || !String(content).trim()) throw new Error('模型没有返回内容');
    return String(content);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`请求超时（${TIMEOUT_MS / 1000} 秒）`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ===== 输出清洗 =====

const CJK = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;

function cleanArticle(raw) {
  let lines = String(raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/[*_`>]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim().replace(/^\s*(\d+[.)、]|[-•])\s+/, '')) // 行首编号/项目符号
    .filter((l) => l && /[A-Za-z]/.test(l) && !CJK.test(l)); // 丢掉纯中文行
  // 模型常自作主张加标题：首行很短且没有句末标点时按标题丢掉
  if (lines.length > 1 && lines[0].length <= 40 && !/[.!?]"?$/.test(lines[0])) {
    lines = lines.slice(1);
  }
  return lines.join('\n').trim();
}

function parseWords(raw) {
  const seen = new Set();
  const out = [];
  for (let line of String(raw || '').split(/[\n,;|]+/)) {
    // 先去 markdown 强调符号，再去行首编号 / 项目符号 / 引号
    line = line
      .replace(/[*_`~]+/g, '')
      .replace(/^\s*(\d+[.)、]|[-•])\s*/, '')
      .replace(/^["'“”]+|["'“”]+$/g, '')
      .trim();
    if (!line) continue;
    // "apple - 苹果" / "apple: 苹果" 这种只取英文部分
    const w = line.split(/\s*[-–—:（(]\s*/)[0].trim();
    const low = w.toLowerCase();
    if (!/^[a-z][a-z '-]*$/.test(low)) continue;
    if (low.length < 2 || low.length > 24) continue;
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(low);
    if (out.length >= 200) break;
  }
  return out;
}

function buildMessages(prompt, isArticle) {
  if (isArticle) {
    return [
      {
        role: 'system',
        content: 'You generate English reading passages for typing practice. Output plain English only: no title, no markdown, no bullet points, no explanations, no Chinese characters.'
      },
      {
        role: 'user',
        content: `Write an English passage about "${prompt}" for typing practice. 300-600 characters, natural sentences, plain text with paragraphs separated by newlines. Output the passage only.`
      }
    ];
  }
  return [
    {
      role: 'system',
      content: 'You generate English vocabulary lists for typing practice. Output only English words or short phrases, one per line. No numbering, no bullets, no punctuation, no explanations, no Chinese.'
    },
    {
      role: 'user',
      content: `Give me 60 English words or short phrases related to "${prompt}" for typing practice. Lowercase, one per line, output the list only.`
    }
  ];
}

// ===== 对外能力 =====

async function generateMaterial({ prompt, kind }) {
  const cfg = loadConfig();
  if (!cfg.baseUrl || !cfg.model || !cfg.apiKey) {
    return {
      ok: false,
      message: '还没配置大模型 API：请到「设置 → AI 素材生成」填好 API 地址、模型名和 Key',
      needConfig: true
    };
  }
  const q = String(prompt || '').trim();
  if (!q) return { ok: false, message: '先写一句生成要求（主题或描述）' };

  try {
    const isArticle = kind === 'article';
    const content = await chat(cfg, buildMessages(q, isArticle), {
      maxTokens: isArticle ? 700 : 900,
      temperature: isArticle ? 0.8 : 0.6
    });

    if (isArticle) {
      const text = cleanArticle(content);
      if (!text) throw new Error('模型没有返回可用的英文文本');
      const title = `AI 短文 · ${q}`;
      return {
        ok: true,
        items: [{
          id: `ai-${Date.now()}`,
          title,
          meta: `${text.length} 字符 · ${cfg.model}`,
          kind: 'article',
          name: title,
          text,
          preview: text.slice(0, 200)
        }]
      };
    }

    const words = parseWords(content);
    if (!words.length) throw new Error('模型没有返回可用的英文单词');
    const title = `AI 词库 · ${q}`;
    return {
      ok: true,
      items: [{
        id: `ai-${Date.now()}`,
        title,
        meta: `${words.length} 词 · ${cfg.model}`,
        kind: 'words',
        name: title,
        words,
        preview: words.slice(0, 40).join(' · ')
      }]
    };
  } catch (err) {
    return { ok: false, message: `生成失败：${err && err.message ? err.message : err}` };
  }
}

// 测试连接：发一个极小的请求，验证地址 / Key / 模型三者都对
async function testConfig({ baseUrl, model, apiKey }) {
  const cfg = {
    baseUrl: String(baseUrl || '').trim() || loadConfig().baseUrl,
    model: String(model || '').trim() || loadConfig().model,
    apiKey: String(apiKey || '').trim() || loadConfig().apiKey
  };
  if (!cfg.baseUrl || !cfg.model || !cfg.apiKey) {
    return { ok: false, message: '地址、模型、Key 三项都要填' };
  }
  try {
    const reply = await chat(cfg, [{ role: 'user', content: 'Reply with the single word: OK' }], {
      maxTokens: 8,
      temperature: 0
    });
    return { ok: true, message: `连接正常，模型回复：${reply.trim().slice(0, 40)}` };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  }
}

module.exports = { loadConfig, saveConfig, generateMaterial, testConfig };
