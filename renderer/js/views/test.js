import { loadJson } from '../storage.js';
import { escapeHtml, shuffle } from '../utils.js';

export async function renderTestView(ctx) {
  const root = document.createElement('div');
  root.className = 'view';
  root.innerHTML = `
    <div class="panel test-panel">
      <div class="panel-title">速度测试</div>
      <div class="test-body">
        <div class="opt-row">
          <span class="opt-label">测试时长</span>
          <div class="opt-group" id="test-dur">
            <button class="opt active" data-ms="60000">1 分钟</button>
            <button class="opt" data-ms="180000">3 分钟</button>
            <button class="opt" data-ms="300000">5 分钟</button>
          </div>
        </div>
        <div class="opt-row">
          <span class="opt-label">测试内容</span>
          <div class="opt-group" id="test-src">
            <button class="opt active" data-src="words">随机单词</button>
            <button class="opt" data-src="article">文章精选</button>
          </div>
        </div>
        <div class="opt-row">
          <span class="opt-label">模式</span>
          <div class="opt-group" id="test-mode">
            <button class="opt active" data-m="strict">严格</button>
            <button class="opt" data-m="free">自由</button>
          </div>
        </div>
        <div class="detail-actions">
          <button class="btn primary big" data-act="start">开始测试</button>
        </div>
        <p class="test-tip">限时到达或文本完成后自动出成绩，成绩记入「成绩统计」。测试中按 Esc 可提前退出。</p>
      </div>
    </div>
  `;
  ctx.content.appendChild(root);

  let layout;
  let articlesData;
  let wordsData;
  let progress;
  try {
    [layout, articlesData, wordsData, progress] = await Promise.all([
      loadJson('layout.json'),
      loadJson('materials/articles.json'),
      loadJson('materials/words.json'),
      ctx.store.progress()
    ]);
  } catch (err) {
    console.error('素材加载失败:', err);
    root.innerHTML = `<div class="panel error-panel">素材加载失败：${escapeHtml(err.message)}</div>`;
    return { cleanup() {} };
  }

  const settings = progress.settings || {};
  const showKeyboard = settings.showKeyboard !== false;
  const defaultMode = settings.defaultMode === 'free' ? 'free' : 'strict';
  root.querySelectorAll('#test-mode .opt').forEach((b) => {
    b.classList.toggle('active', b.dataset.m === defaultMode);
  });

  function wireGroup(groupId) {
    root.querySelectorAll(`#${groupId} .opt`).forEach((b) => {
      b.addEventListener('click', () => {
        root.querySelectorAll(`#${groupId} .opt`).forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
  }
  wireGroup('test-dur');
  wireGroup('test-src');
  wireGroup('test-mode');

  function activeOpt(groupId) {
    return root.querySelector(`#${groupId} .opt.active`);
  }

  root.querySelector('[data-act="start"]').addEventListener('click', () => {
    const durationMs = Number(activeOpt('test-dur').dataset.ms);
    const src = activeOpt('test-src').dataset.src;
    const mode = activeOpt('test-mode').dataset.m;

    let text = '';
    let label = '';
    if (src === 'article') {
      text = articlesData.articles.map((a) => a.text).join(' ');
      label = '文章测试';
    } else {
      const all = wordsData.lists.flatMap((l) => l.words);
      const words = [];
      while (words.length < 260) {
        for (const w of shuffle(all)) {
          words.push(w);
          if (words.length >= 260) break;
        }
      }
      text = words.join(' ');
      label = '随机单词测试';
    }

    ctx.startSession({
      title: label,
      subtitle: mode === 'free' ? '自由模式' : '严格模式',
      text,
      mode,
      showKeyboard,
      layout,
      durationMs,
      source: 'test'
    });
  });

  // 视图完全就绪（事件已绑定）的标记，供自动化冒烟等待
  root.dataset.ready = '1';

  return { cleanup() {} };
}