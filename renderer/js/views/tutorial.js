import { loadJson } from '../storage.js';
import { escapeHtml } from '../utils.js';

function starsHtml(n) {
  const stars = Math.max(0, Math.min(3, n || 0));
  return `<span class="stars">${'★'.repeat(stars)}<span class="star-off">${'☆'.repeat(3 - stars)}</span></span>`;
}

export async function renderTutorialView(ctx) {
  const root = document.createElement('div');
  root.className = 'view two-col';
  root.innerHTML = `
    <aside class="panel tree-panel">
      <div class="panel-title">课程大纲</div>
      <div class="tree"><div class="muted" style="padding:16px">加载中…</div></div>
    </aside>
    <section class="panel detail-panel">
      <div class="empty-hint">选择左侧的一节课开始</div>
    </section>
  `;
  ctx.content.appendChild(root);

  const treeEl = root.querySelector('.tree');
  const detailEl = root.querySelector('.detail-panel');

  let curriculum;
  let progress;
  let layout;
  try {
    [curriculum, progress, layout] = await Promise.all([
      loadJson('curriculum.json'),
      ctx.store.progress(),
      loadJson('layout.json')
    ]);
  } catch (err) {
    console.error('课程数据加载失败:', err);
    treeEl.innerHTML = `<div class="error-panel">课程数据加载失败：${escapeHtml(err.message)}</div>`;
    return { cleanup() {} };
  }

  console.log('curriculum loaded:', curriculum.stages.length, 'stages');

  const settings = progress.settings || {};
  const showKeyboard = settings.showKeyboard !== false;
  // 练习模式唯一真相源 = 设置里的默认模式（练习中还能随时切换）
  const defaultMode = settings.defaultMode === 'free' ? 'free' : 'strict';

  const flat = [];
  for (const stage of curriculum.stages) {
    for (const sec of stage.sections) flat.push({ stage, sec });
  }

  function startSection(stage, sec) {
    const idx = flat.findIndex((x) => x.sec.id === sec.id);
    const next = idx >= 0 && idx + 1 < flat.length ? flat[idx + 1] : null;
    ctx.startSession({
      title: `${stage.name} · ${sec.name}`,
      subtitle: `${defaultMode === 'free' ? '自由模式' : '严格模式'} · Esc 退出`,
      text: sec.text,
      mode: defaultMode,
      showKeyboard,
      layout,
      sectionId: sec.id,
      source: 'tutorial',
      starTwo: curriculum.starThresholds && curriculum.starThresholds.two,
      starThree: curriculum.starThresholds && curriculum.starThresholds.three,
      onNext: next ? () => startSection(next.stage, next.sec) : undefined
    });
  }

  function buildTree() {
    treeEl.innerHTML = '';
    for (const stage of curriculum.stages) {
      const stageEl = document.createElement('div');
      stageEl.className = 'tree-stage';
      const done = stage.sections.filter((s) => (progress.sections[s.id] || {}).stars > 0).length;
      stageEl.innerHTML = `
        <div class="tree-stage-head">
          <span class="tree-stage-name">${escapeHtml(stage.name)}</span>
          <span class="tree-stage-count">${done}/${stage.sections.length}</span>
        </div>
        <div class="tree-stage-desc">${escapeHtml(stage.desc || '')}</div>
      `;
      const list = document.createElement('div');
      list.className = 'tree-sections';
      for (const sec of stage.sections) {
        const item = document.createElement('button');
        item.className = 'tree-item';
        const stars = (progress.sections[sec.id] || {}).stars || 0;
        item.innerHTML = `<span class="tree-item-name">${escapeHtml(sec.name)}</span>${starsHtml(stars)}`;
        item.addEventListener('click', () => {
          treeEl.querySelectorAll('.tree-item').forEach((b) => b.classList.remove('active'));
          item.classList.add('active');
          showDetail(stage, sec);
        });
        list.appendChild(item);
      }
      stageEl.appendChild(list);
      treeEl.appendChild(stageEl);
    }
  }

  function showDetail(stage, sec) {
    const stars = (progress.sections[sec.id] || {}).stars || 0;
    const idx = flat.findIndex((x) => x.sec.id === sec.id);
    const next = idx >= 0 && idx + 1 < flat.length ? flat[idx + 1] : null;
    detailEl.innerHTML = `
      <div class="detail-crumb">${escapeHtml(stage.name)}</div>
      <h2 class="detail-title">${escapeHtml(sec.name)}</h2>
      <p class="detail-desc">${escapeHtml(sec.desc || '')}</p>
      <div class="detail-meta">
        <div class="meta-item"><span class="meta-label">目标键位</span><span class="meta-val mono">${escapeHtml(sec.keys || '综合')}</span></div>
        <div class="meta-item"><span class="meta-label">练习模式</span><span class="meta-val">${defaultMode === 'free' ? '自由（可退格）' : '严格（错即停）'} · 跟随设置</span></div>
        <div class="meta-item"><span class="meta-label">文本长度</span><span class="meta-val">${sec.text.length} 字符</span></div>
        <div class="meta-item"><span class="meta-label">当前星级</span><span class="meta-val">${starsHtml(stars)}</span></div>
        <div class="meta-item"><span class="meta-label">下一节</span><span class="meta-val">${next ? escapeHtml(next.sec.name) : '已是最后一节'}</span></div>
      </div>
      <div class="detail-preview mono">${escapeHtml(sec.text.slice(0, 140))}${sec.text.length > 140 ? '…' : ''}</div>
      <div class="detail-actions">
        <button class="btn primary" data-act="start">开始练习</button>
      </div>
    `;
    detailEl.querySelector('[data-act="start"]').addEventListener('click', () => {
      startSection(stage, sec);
    });
  }

  buildTree();
  root.dataset.ready = '1';
  return { cleanup() {} };
}
