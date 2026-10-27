import { store, loadJson } from './storage.js';
import { createSession } from './session.js';
import { evalStars } from './engine.js';
import { renderTutorialView } from './views/tutorial.js';
import { renderPracticeView } from './views/practice.js';
import { renderTestView } from './views/test.js';
import { renderStatsView } from './views/stats.js';
import { renderSettingsView } from './views/settings.js';
import { escapeHtml } from './utils.js';

const content = document.getElementById('content');
let currentCleanup = null;
let currentView = { view: 'tutorial', params: {} };
// 进行中的练习：切到别的页面时暂停保留，不销毁
let activeSession = null;

function setActiveNav(view) {
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
  });
}

function updateSessionNav() {
  const btn = document.getElementById('nav-session');
  if (!btn) return;
  const alive = !!activeSession && !activeSession.isFinished();
  btn.classList.toggle('hidden', !alive);
  if (alive) btn.textContent = `继续练习 · ${activeSession.title}`;
}

function pauseActiveSession() {
  if (!activeSession) return;
  if (activeSession.isFinished()) {
    activeSession.cleanup();
    activeSession = null;
    return;
  }
  activeSession.pause();
  if (activeSession.root.parentNode) activeSession.root.remove();
}

function resumeActiveSession() {
  if (!activeSession || activeSession.isFinished()) return;
  content.innerHTML = '';
  content.appendChild(activeSession.root);
  activeSession.resume();
  setActiveNav('session');
}

async function renderView(view, params) {
  const ctx = { content, store, loadJson, navigate, startSession };
  switch (view) {
    case 'practice': return renderPracticeView(ctx, params);
    case 'test': return renderTestView(ctx, params);
    case 'stats': return renderStatsView(ctx, params);
    case 'settings': return renderSettingsView(ctx, params);
    case 'tutorial':
    default: return renderTutorialView(ctx, params);
  }
}

export function navigate(view, params = {}) {
  if (currentCleanup) {
    try { currentCleanup(); } catch (err) { console.error(err); }
    currentCleanup = null;
  }
  pauseActiveSession();
  currentView = { view, params };
  setActiveNav(view);
  content.innerHTML = '';
  updateSessionNav();
  renderView(view, params)
    .then((res) => {
      currentCleanup = res && res.cleanup ? res.cleanup : null;
    })
    .catch((err) => {
      content.innerHTML = `<div class="panel error-panel">视图加载失败：${escapeHtml(err.message)}</div>`;
      console.error(err);
    });
}

export async function startSession(opts) {
  const back = currentView;
  if (currentCleanup) {
    try { currentCleanup(); } catch (err) { console.error(err); }
    currentCleanup = null;
  }
  // 新练习开始 → 之前暂停中的练习作废
  if (activeSession) {
    activeSession.cleanup();
    activeSession = null;
  }
  setActiveNav('');
  content.innerHTML = '<div class="loading-hint">正在准备练习…</div>';

  let session;
  try {
    session = await createSession({
      ...opts,
      onExit: () => {
        // 主动退出 = 放弃本次练习
        if (activeSession) {
          activeSession.cleanup();
          activeSession = null;
        }
        navigate(back.view, back.params);
      },
      onFinish: async (stats) => {
        await recordResult(opts, stats);
        updateSessionNav();
        if (opts.afterFinish) await opts.afterFinish(stats);
      }
    });
  } catch (err) {
    content.innerHTML = `<div class="panel error-panel">练习启动失败：${escapeHtml(err.message)}</div>`;
    console.error(err);
    return;
  }

  content.innerHTML = '';
  content.appendChild(session.root);
  currentCleanup = session.cleanup;
  activeSession = {
    root: session.root,
    cleanup: session.cleanup,
    pause: session.pause,
    resume: session.resume,
    isFinished: session.isFinished,
    title: opts.title || '练习'
  };
  updateSessionNav();
}

// 成绩保存串行化：连续「下一节」时两次 read-modify-write 不会互相覆盖
let saveChain = Promise.resolve();

function recordResult(opts, stats) {
  const run = saveChain.then(() => persistResult(opts, stats));
  saveChain = run.catch(() => {});
  return run;
}

async function persistResult(opts, stats) {
  // 防御：极短用时（自动化脚本 / 误触）不入库，避免污染成绩统计与星级
  if (!stats.elapsedMs || stats.elapsedMs < 1500) return;

  await store.appendHistory({
    ts: Date.now(),
    source: opts.source || 'custom',
    label: opts.title || '',
    sectionId: opts.sectionId || null,
    mode: opts.mode || 'strict',
    wpm: stats.wpm,
    cpm: stats.cpm,
    accuracy: stats.accuracy,
    durationMs: Math.round(stats.elapsedMs),
    keystrokes: stats.keystrokes,
    mistakes: stats.mistakes
  });

  if (opts.sectionId) {
    const p = await store.progress();
    const sec = p.sections[opts.sectionId] || { stars: 0, runs: 0, bestWpm: 0, bestAcc: 0 };
    sec.runs = (sec.runs || 0) + 1;
    sec.bestWpm = Math.max(sec.bestWpm || 0, stats.wpm);
    sec.bestAcc = Math.max(sec.bestAcc || 0, stats.accuracy);
    sec.stars = Math.max(sec.stars || 0, evalStars(stats, opts.starTwo, opts.starThree));
    p.sections[opts.sectionId] = sec;
    await store.saveProgress(p);
  }
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.view === 'session') resumeActiveSession();
    else navigate(btn.dataset.view);
  });
});

navigate('tutorial');
console.log('app ready');

if (new URLSearchParams(location.search).has('smoke')) {
  const waitFor = (fn, timeout = 8000, label = '元素') => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      try {
        if (fn()) return resolve();
      } catch (err) { /* 继续等 */ }
      if (Date.now() - t0 > timeout) return reject(new Error(`waitFor 超时: ${label}`));
      setTimeout(tick, 50);
    };
    tick();
  });

  const typeChars = (count) => Array.from(document.querySelectorAll('.typing-text .ch'))
    .slice(0, count)
    .map((el) => (el.textContent === '\u00A0' ? ' ' : el.textContent));

  const press = (key) => window.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );

  const startFirstLesson = async () => {
    document.querySelector('.nav-item[data-view="tutorial"]').click();
    await waitFor(() => document.querySelector('.view[data-ready="1"]'), 8000, '教程视图就绪');
    document.querySelector('.tree-item').click();
    await waitFor(() => document.querySelector('[data-act="start"]'), 8000, '课程详情');
    document.querySelector('[data-act="start"]').click();
    await waitFor(() => document.querySelector('.session .typing-text .ch'), 8000, '会话启动');
  };

  // 冒烟驱动：① 教程「下一节」链路 ② 速度测试选项可选 ③ 严格/自由即时切换 ④ 切页后练习保留
  window.__smoke = {
    async driveNextSection() {
      await waitFor(() => document.querySelector('.tree-item'));
      document.querySelector('.tree-item').click();
      await waitFor(() => document.querySelector('[data-act="start"]'));
      document.querySelector('[data-act="start"]').click();
      await waitFor(() => document.querySelector('.session .typing-text .ch'));

      for (const ch of typeChars(9999)) press(ch);

      await waitFor(() => {
        const r = document.querySelector('.session-result');
        return r && !r.classList.contains('hidden');
      });

      const titleBefore = document.querySelector('.session-title').textContent;
      const starsBefore = (document.querySelector('.result-num.stars') || {}).textContent || '';
      const hasNextBtnBefore = !!document.querySelector('[data-act="next"]');

      press('Enter');

      await waitFor(() => {
        const t = document.querySelector('.session-title');
        return t && t.textContent !== titleBefore;
      });

      return {
        titleBefore,
        titleAfter: document.querySelector('.session-title').textContent,
        starsBefore,
        hasNextBtnBefore,
        hasNextBtnAfter: !!document.querySelector('[data-act="next"]')
      };
    },

    async driveTestOptions() {
      document.querySelector('.nav-item[data-view="test"]').click();
      await waitFor(() => document.querySelector('#test-dur'), 8000, '速度测试视图挂载');
      await waitFor(() => document.querySelector('.view[data-ready="1"]'), 8000, '速度测试视图就绪（事件已绑定）');

      document.querySelector('#test-dur .opt[data-ms="300000"]').click();
      document.querySelector('#test-src .opt[data-src="article"]').click();
      document.querySelector('#test-mode .opt[data-m="free"]').click();

      const picked = {
        dur: document.querySelector('#test-dur .opt.active').dataset.ms,
        src: document.querySelector('#test-src .opt.active').dataset.src,
        mode: document.querySelector('#test-mode .opt.active').dataset.m,
        singleActive:
          document.querySelectorAll('#test-dur .opt.active').length === 1 &&
          document.querySelectorAll('#test-src .opt.active').length === 1 &&
          document.querySelectorAll('#test-mode .opt.active').length === 1
      };

      document.querySelector('[data-act="start"]').click();
      await waitFor(() => document.querySelector('.session-meta'), 8000, '测试会话启动');
      const meta = document.querySelector('.session-meta').textContent;

      press('Escape');
      await waitFor(() => !document.querySelector('.session'), 8000, 'Esc 退出测试会话');

      return { picked, meta };
    },

    async driveModeSwitch() {
      await startFirstLesson();

      const first = document.querySelector('.typing-text .ch').textContent;
      const firstKey = first === '\u00A0' ? ' ' : first;

      // 严格模式：错误键被拦住，只前进 1 个字符
      document.querySelector('.mode-switch .opt[data-mode="strict"]').click();
      press(firstKey);
      press('Z');
      await new Promise((r) => setTimeout(r, 80));
      const strictDone = document.querySelectorAll('.typing-text .ch.done').length;
      const strictWrong = (document.querySelector('.ch-wrong') || {}).textContent || '';

      // 自由模式：错误键也继续前进
      document.querySelector('.mode-switch .opt[data-mode="free"]').click();
      press('Z');
      await new Promise((r) => setTimeout(r, 80));
      const freeDone = document.querySelectorAll('.typing-text .ch.done').length;
      // 退格撤回 → 错字符标注消失
      press('Backspace');
      await new Promise((r) => setTimeout(r, 80));
      const backspaceCleared = !document.querySelector('.ch-wrong');
      // 改对 → 标注依旧不显示，但该位仍标记为错过（记录保留）
      const second = document.querySelectorAll('.typing-text .ch')[1].textContent;
      press(second === '\u00A0' ? ' ' : second);
      await new Promise((r) => setTimeout(r, 80));
      const stillNoWrong = !document.querySelector('.ch-wrong');
      const errKept = document.querySelectorAll('.typing-text .ch')[1].classList.contains('err');
      const modeTag = (document.querySelector('.mode-tag') || {}).textContent || '';

      return { strictDone, strictWrong, freeDone, backspaceCleared, stillNoWrong, errKept, modeTag };
    },

    async driveSessionKeepAlive() {
      await startFirstLesson();

      for (const ch of typeChars(5)) press(ch);
      const doneBefore = document.querySelectorAll('.typing-text .ch.done').length;

      // 切到成绩统计：练习应暂停保留，而不是被销毁
      document.querySelector('.nav-item[data-view="stats"]').click();
      await waitFor(() => {
        const b = document.getElementById('nav-session');
        return b && !b.classList.contains('hidden');
      }, 8000, '继续练习入口出现');
      const sessionHidden = !document.querySelector('.session');
      const navLabel = document.getElementById('nav-session').textContent;

      // 点「继续练习」回来：进度应原样保留
      document.getElementById('nav-session').click();
      await waitFor(() => document.querySelector('.session'), 8000, '会话恢复');
      const doneAfter = document.querySelectorAll('.typing-text .ch.done').length;

      return { doneBefore, doneAfter, sessionHidden, navLabel };
    },

    async driveCustomMaterial() {
      await window.api.saveCustomMaterials({
        articles: [{ id: 'smoke-1', name: '冒烟导入文章', text: 'The quick brown fox jumps over the lazy dog.' }],
        lists: [{ id: 'smoke-w1', name: '冒烟导入词库', words: ['alpha', 'beta', 'gamma'] }]
      });
      document.querySelector('.nav-item[data-view="practice"]').click();
      await waitFor(() => document.querySelector('.view[data-ready="1"]'), 8000, '素材视图就绪');
      await waitFor(() => document.querySelector('.mat-item'), 8000, '素材列表渲染');

      const names = Array.from(document.querySelectorAll('.mat-item .mat-name')).map((el) => el.textContent);
      const hasCustom = names.some((n) => n.indexOf('冒烟导入文章') >= 0);
      const badge = !!document.querySelector('.tag-import');

      // 切到词库 tab：导入的词库应出现在列表里（v1.0.5 修复点：此前导入只归文章）
      document.querySelector('.tab[data-tab="words"]').click();
      await waitFor(() => {
        return Array.from(document.querySelectorAll('.mat-item .mat-name'))
          .some((el) => el.textContent.indexOf('冒烟导入词库') >= 0);
      }, 8000, '词库 tab 出现导入的词库');
      const wordsTabHasCustom = Array.from(document.querySelectorAll('.mat-item .mat-name'))
        .some((el) => el.textContent.indexOf('冒烟导入词库') >= 0);
      const wordsTabBadge = !!document.querySelector('.tag-import');
      const importBtnLabel = (document.querySelector('#import-txt') || {}).textContent || '';

      // 点导入的词库 → 应进入词库练习详情（有练习数量选项），而不是文章预览
      const customItem = Array.from(document.querySelectorAll('.mat-item'))
        .find((el) => el.querySelector('.mat-name').textContent.indexOf('冒烟导入词库') >= 0);
      customItem.click();
      await waitFor(() => document.querySelector('#word-count'), 8000, '词库练习详情');
      const detailTitle = (document.querySelector('.detail-title') || {}).textContent || '';

      await window.api.saveCustomMaterials({ articles: [], lists: [] });
      return {
        hasCustom, badge,
        wordsTabHasCustom, wordsTabBadge, importBtnLabel, detailTitle,
        total: names.length, firstName: names[0] || ''
      };
    },

    async driveOnlineMaterial() {
      document.querySelector('.nav-item[data-view="practice"]').click();
      await waitFor(() => document.querySelector('.view[data-ready="1"]'), 8000, '素材视图就绪');
      await waitFor(() => document.querySelector('.mat-item'), 8000, '素材列表渲染');

      // 切到「在线」tab：搜索框出现、txt 导入行隐藏
      document.querySelector('.tab[data-tab="online"]').click();
      await waitFor(() => document.querySelector('#online-q'), 8000, '在线搜索框');
      const importHidden = document.querySelector('#import-row').classList.contains('hidden');

      // 搜索：--smoke 模式下主进程走内置 mock，不依赖网络
      document.querySelector('#online-q').value = 'smoke';
      document.querySelector('#online-go').click();
      await waitFor(() => document.querySelector('.mat-item'), 8000, '在线搜索结果');
      const resultTitle = (document.querySelector('.mat-item .mat-name') || {}).textContent || '';

      // 点结果 → 右侧预览 → 导入为词库
      document.querySelector('.mat-item').click();
      await waitFor(() => document.querySelector('[data-act="import"]'), 8000, '在线素材预览');
      const importLabel = (document.querySelector('[data-act="import"]') || {}).textContent || '';
      document.querySelector('[data-act="import"]').click();

      await waitFor(() => {
        const tab = document.querySelector('.tab[data-tab="words"]');
        return tab && tab.classList.contains('active');
      }, 8000, '导入后切到词库 tab');
      const wordsTabActive = document.querySelector('.tab[data-tab="words"]').classList.contains('active');
      const hasBadge = !!document.querySelector('.tag-import');
      const firstItemName = (document.querySelector('.mat-item .mat-name') || {}).textContent || '';

      await window.api.saveCustomMaterials({ articles: [], lists: [] });
      return { importHidden, resultTitle, importLabel, wordsTabActive, hasBadge, firstItemName };
    },

    async driveAiMaterial() {
      document.querySelector('.nav-item[data-view="practice"]').click();
      await waitFor(() => document.querySelector('.view[data-ready="1"]'), 8000, '素材视图就绪');
      await waitFor(() => document.querySelector('.mat-item'), 8000, '素材列表渲染');

      // 在线 tab → 选「AI 生成」→ 应出现「生成词库 / 生成短文」类型切换
      document.querySelector('.tab[data-tab="online"]').click();
      await waitFor(() => document.querySelector('#online-src .opt[data-src="ai"]'), 8000, '在线来源按钮');
      document.querySelector('#online-src .opt[data-src="ai"]').click();
      await waitFor(() => !document.querySelector('#ai-kind').classList.contains('hidden'), 8000, 'AI 类型切换出现');

      // 生成短文（--smoke 下主进程走 mock，不依赖真实 API）
      document.querySelector('#ai-kind .opt[data-kind="article"]').click();
      document.querySelector('#online-q').value = 'river';
      document.querySelector('#online-go').click();
      await waitFor(() => document.querySelector('.mat-item'), 8000, 'AI 生成结果');
      const resultTitle = (document.querySelector('.mat-item .mat-name') || {}).textContent || '';

      document.querySelector('.mat-item').click();
      await waitFor(() => document.querySelector('[data-act="import"]'), 8000, 'AI 素材预览');
      const importLabel = (document.querySelector('[data-act="import"]') || {}).textContent || '';
      const previewLen = (document.querySelector('.detail-preview') || { textContent: '' }).textContent.length;

      document.querySelector('[data-act="import"]').click();
      await waitFor(() => {
        const tab = document.querySelector('.tab[data-tab="articles"]');
        return tab && tab.classList.contains('active');
      }, 8000, 'AI 短文导入后切到文章 tab');
      const articlesTabActive = document.querySelector('.tab[data-tab="articles"]').classList.contains('active');
      const hasBadge = !!document.querySelector('.tag-import');

      await window.api.saveCustomMaterials({ articles: [], lists: [] });
      return { resultTitle, importLabel, previewLen, articlesTabActive, hasBadge };
    },

    async driveSettings() {
      document.querySelector('.nav-item[data-view="settings"]').click();
      await waitFor(() => document.querySelector('.view[data-ready="1"]'), 8000, '设置视图就绪');
      const ver = (document.querySelector('[data-s="appver"]') || {}).textContent || '';
      const hasUpdateBtn = !!document.querySelector('#check-update');
      const btnLabel = (document.querySelector('#check-update') || {}).textContent || '';
      const hasAiConfig = !!document.querySelector('#ai-base') && !!document.querySelector('#ai-model') && !!document.querySelector('#ai-key');
      const aiTestBtn = !!document.querySelector('#ai-test');
      return { ver, hasUpdateBtn, btnLabel, hasAiConfig, aiTestBtn };
    }
  };
  if (window.api && window.api.smokeReady) window.api.smokeReady();
}
