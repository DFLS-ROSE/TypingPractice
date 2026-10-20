import { loadJson, customMaterials } from '../storage.js';
import { escapeHtml, shuffle } from '../utils.js';

export async function renderPracticeView(ctx) {
  const root = document.createElement('div');
  root.className = 'view two-col';
  root.innerHTML = `
    <aside class="panel list-panel">
      <div class="panel-title">素材库</div>
      <div class="mat-tabs">
        <button class="tab active" data-tab="articles">文章</button>
        <button class="tab" data-tab="words">词库</button>
      </div>
      <div class="list-actions">
        <button class="btn" id="import-txt">导入 txt 文章</button>
        <span class="list-hint">英文文本，多行也行</span>
      </div>
      <div class="mat-list"><div class="muted" style="padding:16px">加载中…</div></div>
    </aside>
    <section class="panel detail-panel">
      <div class="empty-hint">选择左侧素材开始练习</div>
    </section>
  `;
  ctx.content.appendChild(root);

  const listEl = root.querySelector('.mat-list');
  const detailEl = root.querySelector('.detail-panel');

  let layout;
  let articlesData;
  let wordsData;
  let progress;
  let custom;
  try {
    [layout, articlesData, wordsData, progress, custom] = await Promise.all([
      loadJson('layout.json'),
      loadJson('materials/articles.json'),
      loadJson('materials/words.json'),
      ctx.store.progress(),
      customMaterials.load()
    ]);
  } catch (err) {
    console.error('素材加载失败:', err);
    listEl.innerHTML = `<div class="error-panel">素材加载失败：${escapeHtml(err.message)}</div>`;
    return { cleanup() {} };
  }

  const settings = progress.settings || {};
  const showKeyboard = settings.showKeyboard !== false;
  const defaultMode = settings.defaultMode === 'free' ? 'free' : 'strict';

  // 导入的文章排在前面，带「导入」标记
  let articles = [
    ...custom.map((a) => ({ ...a, custom: true })),
    ...articlesData.articles
  ];

  function renderList(kind) {
    listEl.innerHTML = '';
    const items = kind === 'articles' ? articles : wordsData.lists;
    for (const entry of items) {
      const item = document.createElement('button');
      item.className = 'mat-item';
      const meta = kind === 'articles' ? `${entry.text.length} 字符` : `${entry.words.length} 词`;
      const badge = entry.custom ? '<span class="tag-import">导入</span>' : '';
      item.innerHTML = `<span class="mat-name">${badge}${escapeHtml(entry.name)}</span><span class="mat-len">${meta}</span>`;
      item.addEventListener('click', () => {
        listEl.querySelectorAll('.mat-item').forEach((b) => b.classList.remove('active'));
        item.classList.add('active');
        if (kind === 'articles') showArticle(entry);
        else showWords(entry);
      });
      if (kind === 'articles' && entry.custom) {
        const del = document.createElement('button');
        del.className = 'mat-del';
        del.textContent = '×';
        del.title = '删除这篇导入的文章';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!confirm(`删除导入的文章「${entry.name}」？`)) return;
          customMaterials.remove(entry.id).then(async () => {
            custom = await customMaterials.load();
            articles = [
              ...custom.map((a) => ({ ...a, custom: true })),
              ...articlesData.articles
            ];
            detailEl.innerHTML = `<div class="empty-hint">选择左侧素材开始练习</div>`;
            renderList('articles');
          });
        });
        item.appendChild(del);
      }
      listEl.appendChild(item);
    }
  }

  async function refreshArticles() {
    custom = await customMaterials.load();
    articles = [
      ...custom.map((a) => ({ ...a, custom: true })),
      ...articlesData.articles
    ];
    root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'articles'));
    renderList('articles');
  }

  function showArticle(art) {
    detailEl.innerHTML = `
      <div class="detail-crumb">素材库 · 文章${art.custom ? ' · 导入' : ''}</div>
      <h2 class="detail-title">${escapeHtml(art.name)}</h2>
      <div class="detail-preview mono">${escapeHtml(art.text)}</div>
      <div class="detail-actions">
        <button class="btn primary" data-act="start">开始练习</button>
      </div>
    `;
    detailEl.querySelector('[data-act="start"]').addEventListener('click', () => {
      ctx.startSession({
        title: `文章练习 · ${art.name}`,
        subtitle: `${art.text.length} 字符 · ${defaultMode === 'free' ? '自由模式' : '严格模式'} · Esc 退出`,
        text: art.text,
        mode: defaultMode,
        showKeyboard,
        layout,
        source: 'article'
      });
    });
  }

  function showWords(wl) {
    detailEl.innerHTML = `
      <div class="detail-crumb">素材库 · 词库</div>
      <h2 class="detail-title">${escapeHtml(wl.name)}</h2>
      <div class="opt-row">
        <span class="opt-label">练习数量</span>
        <div class="opt-group" id="word-count">
          <button class="opt active" data-n="20">20 词</button>
          <button class="opt" data-n="50">50 词</button>
          <button class="opt" data-n="100">100 词</button>
        </div>
      </div>
      <div class="opt-row">
        <span class="opt-label">练习模式</span>
        <div class="opt-group" id="word-mode">
          <button class="opt${defaultMode === 'strict' ? ' active' : ''}" data-m="strict">严格</button>
          <button class="opt${defaultMode === 'free' ? ' active' : ''}" data-m="free">自由</button>
        </div>
      </div>
      <div class="detail-actions">
        <button class="btn primary" data-act="start">开始练习</button>
      </div>
    `;
    let count = 20;
    let mode = defaultMode;
    detailEl.querySelectorAll('#word-count .opt').forEach((b) => {
      b.addEventListener('click', () => {
        detailEl.querySelectorAll('#word-count .opt').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        count = Number(b.dataset.n);
      });
    });
    detailEl.querySelectorAll('#word-mode .opt').forEach((b) => {
      b.addEventListener('click', () => {
        detailEl.querySelectorAll('#word-mode .opt').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        mode = b.dataset.m;
      });
    });
    detailEl.querySelector('[data-act="start"]').addEventListener('click', () => {
      const words = [];
      const pool = wl.words.slice();
      while (words.length < count) {
        for (const w of shuffle(pool)) {
          words.push(w);
          if (words.length >= count) break;
        }
      }
      ctx.startSession({
        title: `词库练习 · ${wl.name}`,
        subtitle: `${count} 词 · ${mode === 'free' ? '自由模式' : '严格模式'}`,
        text: words.join(' '),
        mode,
        showKeyboard,
        layout,
        source: 'words'
      });
    });
  }

  root.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      root.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      renderList(tab.dataset.tab);
    });
  });

  const importBtn = root.querySelector('#import-txt');
  importBtn.addEventListener('click', async () => {
    importBtn.disabled = true;
    importBtn.textContent = '选择文件…';
    try {
      const picked = await window.api.importTextFile();
      if (!picked) return;
      const text = String(picked.text || '').replace(/\r\n/g, '\n').trim();
      if (!text) {
        alert('这个文件是空的，没有可练的内容。');
        return;
      }
      await customMaterials.add({
        id: `custom-${Date.now()}`,
        name: picked.name || '导入文章',
        text,
        importedAt: Date.now()
      });
      await refreshArticles();
      const first = listEl.querySelector('.mat-item');
      if (first) {
        first.click();
        first.scrollIntoView({ block: 'nearest' });
      }
    } catch (err) {
      console.error('导入失败:', err);
      alert(`导入失败：${err.message}`);
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = '导入 txt 文章';
    }
  });

  renderList('articles');

  root.dataset.ready = '1';
  return { cleanup() {} };
}
