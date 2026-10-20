const cache = new Map();

export async function loadJson(relPath) {
  if (cache.has(relPath)) return cache.get(relPath);
  const res = await fetch('app://data/' + relPath);
  if (!res.ok) throw new Error(`加载失败: ${relPath} (HTTP ${res.status})`);
  const data = await res.json();
  cache.set(relPath, data);
  return data;
}

export const store = {
  async progress() {
    const p = (await window.api.loadProgress()) || {};
    if (!p.settings) p.settings = {};
    if (!p.sections) p.sections = {};
    return p;
  },
  saveProgress(data) {
    return window.api.saveProgress(data);
  },
  async history() {
    return (await window.api.loadHistory()) || [];
  },
  appendHistory(record) {
    return window.api.appendHistory(record);
  },
  clearHistory() {
    return window.api.clearHistory();
  }
};

// 用户自己导入的练习文章，存在 userData 里（覆盖安装 / 卸载都不会丢）
export const customMaterials = {
  async load() {
    const data = (await window.api.loadCustomMaterials()) || {};
    return Array.isArray(data.articles) ? data.articles : [];
  },
  async add(article) {
    const list = await customMaterials.load();
    list.push(article);
    return customMaterials.save(list);
  },
  async remove(id) {
    const list = (await customMaterials.load()).filter((a) => a.id !== id);
    return customMaterials.save(list);
  },
  save(articles) {
    return window.api.saveCustomMaterials({ articles });
  }
};
