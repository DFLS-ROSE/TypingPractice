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

// 用户自己导入的练习素材，存在 userData 里（覆盖安装 / 卸载都不会丢）
// 文件结构：{ articles: [...], lists: [...] }
//   articles —— 导入的文章（整段文本）
//   lists    —— 导入的词库（单词数组）
// 旧版本只有 articles 一个键，读取时对 lists 做缺省兜底，老数据直接兼容
export const customMaterials = {
  async loadAll() {
    const data = (await window.api.loadCustomMaterials()) || {};
    return {
      articles: Array.isArray(data.articles) ? data.articles : [],
      lists: Array.isArray(data.lists) ? data.lists : []
    };
  },
  async loadArticles() {
    return (await customMaterials.loadAll()).articles;
  },
  async loadLists() {
    return (await customMaterials.loadAll()).lists;
  },
  async addArticle(article) {
    const data = await customMaterials.loadAll();
    data.articles.push(article);
    return customMaterials.save(data);
  },
  async removeArticle(id) {
    const data = await customMaterials.loadAll();
    data.articles = data.articles.filter((a) => a.id !== id);
    return customMaterials.save(data);
  },
  async addList(list) {
    const data = await customMaterials.loadAll();
    data.lists.push(list);
    return customMaterials.save(data);
  },
  async removeList(id) {
    const data = await customMaterials.loadAll();
    data.lists = data.lists.filter((l) => l.id !== id);
    return customMaterials.save(data);
  },
  save(data) {
    return window.api.saveCustomMaterials({
      articles: Array.isArray(data.articles) ? data.articles : [],
      lists: Array.isArray(data.lists) ? data.lists : []
    });
  }
};
