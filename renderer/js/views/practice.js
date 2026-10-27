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
        <button class="tab" data-tab="online">在线</button>
      </div>
      <div class="list-actions" id="import-row">
        <button class="btn" id="import-txt">导入 txt 文章</button>
        <span class="list-hint">英文文本，多行也行</span>
      </div>
      <div class="list-actions hidden" id="online-row">
        <input class="search-input" id="online-q" type="text" placeholder="主题词，如 music" />
        <button class="btn" id="online-go">搜索</button>
      </div>
      <div class="online-src hidden" id="online-src">
        <button class="opt active" data-src="words">主题词库</button>
        <button class="opt" data-src="sentences">例句短文</button>
        <button class="opt" data-src="freq">高频词表</button>
        <button class="opt" data-src="ai">AI 生成</button>
      </div>
      <div class="online-src hidden" id="ai-kind">
        <button class="opt active" data-kind="words">生成词库</button>
        <button class="opt" data-kind="article">生成短文</button>
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
  let custom;      // 导入的文章
  let customLists; // 导入的词库
  try {
    [layout, articlesData, wordsData, progress, custom, customLists] = await Promise.all([
      loadJson('layout.json'),
      loadJson('materials/articles.json'),
      loadJson('materials/words.json'),
      ctx.store.progress(),
      customMaterials.loadArticles(),
      customMaterials.loadLists()
    ]);
  } catch (err) {
    console.error('素材加载失败:', err);
    listEl.innerHTML = `<div class="error-panel">素材加载失败：${escapeHtml(err.message)}</div>`;
    return { cleanup() {} };
  }

  const settings = progress.settings || {};
  const showKeyboard = settings.showKeyboard !== false;
  const defaultMode = settings.defaultMode === 'free' ? 'free' : 'strict';

  // 当前激活的 tab：articles（文章）/ words（词库）/ online（在线素材）
  // 前两个既决定列表内容，也决定导入的 txt 归为文章还是词库（v1.0.5 修复）
  let activeTab = 'articles';

  // 在线素材状态（v1.1.0）
  let onlineSource = 'words';
  let onlineResults = [];
  let onlineBusy = false;
  const ONLINE_PLACEHOLDER = {
    words: '主题词，如 music',
    sentences: '关键词，如 animals',
    freq: '过滤词，可留空',
    ai: '主题或要求，如：旅行常用词 / 一篇关于咖啡的短文'
  };
  // AI 生成类型（v1.2.0）：词库 or 短文
  let aiKind = 'words';

  // 导入的素材排在前面，带「导入」标记
  let articles = [
    ...custom.map((a) => ({ ...a, custom: true })),
    ...articlesData.articles
  ];
  let lists = [
    ...customLists.map((l) => ({ ...l, custom: true })),
    ...wordsData.lists
  ];

  // 三个 tab 的可见区块与文案切换
  function syncTabs() {
    root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === activeTab));
    const online = activeTab === 'online';
    root.querySelector('#import-row').classList.toggle('hidden', online);
    root.querySelector('#online-row').classList.toggle('hidden', !online);
    root.querySelector('#online-src').classList.toggle('hidden', !online);
    root.querySelector('#ai-kind').classList.toggle('hidden', !(online && onlineSource === 'ai'));
    if (!online) {
      const asWords = activeTab === 'words';
      importBtn.textContent = asWords ? '导入 txt 词库' : '导入 txt 文章';
      root.querySelector('.list-hint').textContent = asWords
        ? '英文单词，空格或换行分隔'
        : '英文文本，多行也行';
    }
    root.querySelector('#online-q').placeholder = ONLINE_PLACEHOLDER[onlineSource] || '关键词';
  }

  function renderList(kind) {
    if (kind === 'online') {
      renderOnlineResults();
      return;
    }
    listEl.innerHTML = '';
    const items = kind === 'articles' ? articles : lists;
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
      if (entry.custom) {
        const del = document.createElement('button');
        del.className = 'mat-del';
        del.textContent = '×';
        del.title = kind === 'articles' ? '删除这篇导入的文章' : '删除这个导入的词库';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          const label = kind === 'articles' ? '文章' : '词库';
          if (!confirm(`删除导入的${label}「${entry.name}」？`)) return;
          const done = kind === 'articles'
            ? customMaterials.removeArticle(entry.id)
            : customMaterials.removeList(entry.id);
          done.then(async () => {
            await refreshMaterials();
            detailEl.innerHTML = `<div class="empty-hint">选择左侧素材开始练习</div>`;
          });
        });
        item.appendChild(del);
      }
      listEl.appendChild(item);
    }
  }

  // 重新拉取导入的素材并重绘当前 tab；selectFirst = 选中列表第一项（刚导入的那条）
  async function refreshMaterials(selectFirst = false) {
    custom = await customMaterials.loadArticles();
    customLists = await customMaterials.loadLists();
    articles = [
      ...custom.map((a) => ({ ...a, custom: true })),
      ...articlesData.articles
    ];
    lists = [
      ...customLists.map((l) => ({ ...l, custom: true })),
      ...wordsData.lists
    ];
    renderList(activeTab);
    if (selectFirst) {
      const first = listEl.querySelector('.mat-item');
      if (first) {
        first.click();
        first.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  // ===== 在线素材（v1.1.0）：搜索 → 预览 → 一键导入 =====
  function renderOnlineResults() {
    listEl.innerHTML = '';
    if (!onlineResults.length) {
      const hint = document.createElement('div');
      hint.className = 'muted';
      hint.style.padding = '16px';
      hint.textContent = '输入关键词后点「搜索」，从在线源取素材';
      listEl.appendChild(hint);
      return;
    }
    for (const item of onlineResults) {
      const el = document.createElement('button');
      el.className = 'mat-item';
      el.innerHTML = `<span class="mat-name">${escapeHtml(item.title)}</span><span class="mat-len">${escapeHtml(item.meta)}</span>`;
      el.addEventListener('click', () => {
        listEl.querySelectorAll('.mat-item').forEach((b) => b.classList.remove('active'));
        el.classList.add('active');
        showOnlineItem(item);
      });
      listEl.appendChild(el);
    }
  }

  function showOnlineItem(item) {
    const asWords = item.kind === 'words';
    const body = asWords ? item.words.join(' ') : item.text;
    const preview = body.length > 4000
      ? `${body.slice(0, 4000)} …（预览截断，导入后保留完整内容）`
      : body;
    detailEl.innerHTML = `
      <div class="detail-crumb">在线素材 · ${asWords ? '词库' : '文章'} · ${escapeHtml(item.meta)}</div>
      <h2 class="detail-title">${escapeHtml(item.title)}</h2>
      <div class="detail-preview mono">${escapeHtml(preview)}</div>
      <div class="detail-actions">
        <button class="btn primary" data-act="import">导入为${asWords ? '词库' : '文章'}</button>
      </div>
    `;
    detailEl.querySelector('[data-act="import"]').addEventListener('click', () => importOnlineItem(item));
  }

  async function importOnlineItem(item) {
    const asWords = item.kind === 'words';
    const id = `online-${Date.now()}`;
    try {
      if (asWords) {
        await customMaterials.addList({
          id,
          name: item.name || item.title,
          words: item.words,
          importedAt: Date.now()
        });
        activeTab = 'words';
      } else {
        await customMaterials.addArticle({
          id,
          name: item.name || item.title,
          text: item.text,
          importedAt: Date.now()
        });
        activeTab = 'articles';
      }
      syncTabs();
      await refreshMaterials(true);
    } catch (err) {
      console.error('在线素材导入失败:', err);
      alert(`导入失败：${err.message}`);
    }
  }

  async function runOnlineSearch() {
    if (onlineBusy) return;
    const goBtn = root.querySelector('#online-go');
    const query = root.querySelector('#online-q').value.trim();
    onlineBusy = true;
    goBtn.disabled = true;
    goBtn.textContent = '搜索中…';
    listEl.innerHTML = '<div class="muted" style="padding:16px">正在请求在线素材…（例句源与 AI 生成较慢，可能需要十几秒）</div>';
    detailEl.innerHTML = '<div class="empty-hint">正在请求在线素材…</div>';
    try {
      const res = await window.api.onlineSearch({ source: onlineSource, query, kind: aiKind });
      onlineResults = res && res.ok && Array.isArray(res.items) ? res.items : [];
      if (!onlineResults.length) {
        const msg = (res && res.message) || '没有找到素材';
        const tip = res && res.needConfig ? '<br>（设置 → AI 素材生成）' : '';
        listEl.innerHTML = `<div class="muted" style="padding:16px">${escapeHtml(msg)}</div>`;
        detailEl.innerHTML = `<div class="empty-hint">${escapeHtml(msg)}${tip}</div>`;
      } else {
        renderOnlineResults();
        detailEl.innerHTML = '<div class="empty-hint">点击左侧结果预览，然后导入</div>';
      }
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      onlineResults = [];
      listEl.innerHTML = `<div class="error-panel">搜索失败：${escapeHtml(msg)}</div>`;
      detailEl.innerHTML = '<div class="empty-hint">搜索失败，检查网络后重试</div>';
    } finally {
      onlineBusy = false;
      goBtn.disabled = false;
      goBtn.textContent = '搜索';
    }
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
      <div class="detail-crumb">素材库 · 词库${wl.custom ? ' · 导入' : ''}</div>
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
      const pool = wl.words.slice();
      if (!pool.length) {
        alert('这个词库是空的，没有可练的内容。');
        return;
      }
      const words = [];
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
      activeTab = tab.dataset.tab;
      syncTabs();
      renderList(activeTab);
      if (activeTab === 'online') {
        detailEl.innerHTML = onlineResults.length
          ? '<div class="empty-hint">点击左侧结果预览，然后导入</div>'
          : '<div class="empty-hint">输入关键词后点「搜索」</div>';
      } else {
        detailEl.innerHTML = '<div class="empty-hint">选择左侧素材开始练习</div>';
      }
    });
  });

  // 在线搜索控件
  const onlineInput = root.querySelector('#online-q');
  root.querySelector('#online-go').addEventListener('click', runOnlineSearch);
  onlineInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runOnlineSearch();
    }
  });
  root.querySelectorAll('#online-src .opt').forEach((b) => {
    b.addEventListener('click', () => {
      root.querySelectorAll('#online-src .opt').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      onlineSource = b.dataset.src;
      onlineResults = [];
      syncTabs();
      renderOnlineResults();
      detailEl.innerHTML = '<div class="empty-hint">输入关键词后点「搜索」</div>';
    });
  });

  root.querySelectorAll('#ai-kind .opt').forEach((b) => {
    b.addEventListener('click', () => {
      root.querySelectorAll('#ai-kind .opt').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      aiKind = b.dataset.kind;
      onlineResults = [];
      renderOnlineResults();
      detailEl.innerHTML = '<div class="empty-hint">写一句生成要求，然后点「搜索」即可生成</div>';
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
      // v1.0.5 修复：按当前 tab 决定导入类型——文章 tab 存文章，词库 tab 存词库
      if (activeTab === 'words') {
        const words = text.split(/\s+/).filter(Boolean);
        if (!words.length) {
          alert('没有解析出任何单词：请用空格或换行分隔单词。');
          return;
        }
        await customMaterials.addList({
          id: `custom-${Date.now()}`,
          name: picked.name || '导入词库',
          words,
          importedAt: Date.now()
        });
      } else {
        await customMaterials.addArticle({
          id: `custom-${Date.now()}`,
          name: picked.name || '导入文章',
          text,
          importedAt: Date.now()
        });
      }
      await refreshMaterials(true);
    } catch (err) {
      console.error('导入失败:', err);
      alert(`导入失败：${err.message}`);
    } finally {
      importBtn.disabled = false;
      syncTabs();
    }
  });

  syncTabs();
  renderList('articles');

  root.dataset.ready = '1';
  return { cleanup() {} };
}
