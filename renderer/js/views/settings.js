import { store } from '../storage.js';

export async function renderSettingsView(ctx) {
  const root = document.createElement('div');
  root.className = 'view';
  root.innerHTML = `
    <div class="panel settings-panel">
      <div class="panel-title">设置</div>
      <div class="settings-body">
        <div class="opt-row">
          <span class="opt-label">显示虚拟键盘</span>
          <div class="opt-group" id="set-kb">
            <button class="opt" data-v="1">开启</button>
            <button class="opt" data-v="0">关闭</button>
          </div>
        </div>
        <div class="opt-row">
          <span class="opt-label">默认练习模式</span>
          <div class="opt-group" id="set-mode">
            <button class="opt" data-m="strict">严格（错即停）</button>
            <button class="opt" data-m="free">自由（可退格）</button>
          </div>
        </div>
        <div class="opt-row">
          <span class="opt-label">当前版本</span>
          <span class="opt-value" data-s="appver">读取中…</span>
        </div>
        <div class="opt-row">
          <span class="opt-label">检查更新</span>
          <button class="btn" id="check-update">检查更新</button>
          <span class="opt-hint" data-s="update-msg"></span>
        </div>
        <div class="settings-divider">AI 素材生成（可选）</div>
        <div class="opt-row">
          <span class="opt-label">常用服务</span>
          <div class="opt-group" id="ai-presets">
            <button class="opt" data-base="https://api.deepseek.com/v1" data-model="deepseek-chat">DeepSeek</button>
            <button class="opt" data-base="https://dashscope.aliyuncs.com/compatible-mode/v1" data-model="qwen-plus">通义千问</button>
            <button class="opt" data-base="https://api.moonshot.cn/v1" data-model="moonshot-v1-8k">Kimi</button>
            <button class="opt" data-base="https://open.bigmodel.cn/api/paas/v4" data-model="glm-4-flash">智谱 GLM</button>
            <button class="opt" data-base="https://api.openai.com/v1" data-model="gpt-4o-mini">OpenAI</button>
          </div>
        </div>
        <div class="ai-form">
          <input class="search-input" id="ai-base" placeholder="API 地址（OpenAI 兼容），如 https://api.deepseek.com/v1" />
          <input class="search-input" id="ai-model" placeholder="模型名，如 deepseek-chat" />
          <input class="search-input" id="ai-key" type="password" placeholder="API Key（本机加密保存）" />
        </div>
        <div class="opt-row">
          <span class="opt-label"></span>
          <button class="btn" id="ai-save">保存配置</button>
          <button class="btn" id="ai-test">测试连接</button>
          <span class="opt-hint" data-s="ai-msg"></span>
        </div>
        <p class="settings-tip">填好后，在「素材练习 → 在线 → AI 生成」里输入主题即可生成词库或短文。Key 用系统凭据加密后存于本机 user-data，不上传任何服务器；仅在生成素材时随请求发给你填写的 API 地址。</p>
        <div class="opt-row">
          <span class="opt-label">成绩记录</span>
          <button class="btn danger" id="clear-history">清空全部记录</button>
        </div>
        <p class="settings-tip">设置与成绩保存在本机用户目录（AppData/Roaming/TypingPractice/user-data），换电脑不会同步。</p>
      </div>
    </div>
  `;
  ctx.content.appendChild(root);

  const progress = await store.progress();
  const settings = progress.settings || {};
  const showKb = settings.showKeyboard !== false;
  const mode = settings.defaultMode === 'free' ? 'free' : 'strict';

  function syncOpts(groupId, predicate) {
    root.querySelectorAll(`#${groupId} .opt`).forEach((b) => {
      b.classList.toggle('active', predicate(b));
    });
  }
  syncOpts('set-kb', (b) => (b.dataset.v === '1') === showKb);
  syncOpts('set-mode', (b) => b.dataset.m === mode);

  root.querySelectorAll('#set-kb .opt').forEach((b) => {
    b.addEventListener('click', async () => {
      const p = await store.progress();
      p.settings = p.settings || {};
      p.settings.showKeyboard = b.dataset.v === '1';
      await store.saveProgress(p);
      syncOpts('set-kb', (x) => x === b);
    });
  });

  root.querySelectorAll('#set-mode .opt').forEach((b) => {
    b.addEventListener('click', async () => {
      const p = await store.progress();
      p.settings = p.settings || {};
      p.settings.defaultMode = b.dataset.m;
      await store.saveProgress(p);
      syncOpts('set-mode', (x) => x === b);
    });
  });

  // 当前版本：取自主进程的 package.json 版本号
  const verEl = root.querySelector('[data-s="appver"]');
  const updateMsg = root.querySelector('[data-s="update-msg"]');
  const updateBtn = root.querySelector('#check-update');
  try {
    const v = await window.api.getVersion();
    verEl.textContent = `v${v}`;
  } catch (err) {
    verEl.textContent = '未知';
  }

  // 检查更新：开发模式下退化为「打开发行页」；打包后走完整的
  // 检查 → 下载 → 重启安装 流程（electron-updater + GitHub Releases）
  let state = { status: 'idle', percent: 0, message: '' };

  function renderUpdate() {
    const s = state;
    switch (s.status) {
      case 'dev':
        updateBtn.textContent = '打开发行页';
        updateBtn.disabled = false;
        updateMsg.textContent = '开发模式下不检查更新';
        break;
      case 'checking':
        updateBtn.textContent = '检查中…';
        updateBtn.disabled = true;
        updateMsg.textContent = s.message || '';
        break;
      case 'available':
        updateBtn.textContent = '下载并安装';
        updateBtn.disabled = false;
        updateMsg.textContent = s.message || '';
        break;
      case 'downloading':
        updateBtn.textContent = `下载中 ${s.percent}%`;
        updateBtn.disabled = true;
        updateMsg.textContent = s.message || '';
        break;
      case 'downloaded':
        updateBtn.textContent = '重启并安装';
        updateBtn.disabled = false;
        updateMsg.textContent = s.message || '';
        break;
      case 'not-available':
        updateBtn.textContent = '检查更新';
        updateBtn.disabled = false;
        updateMsg.textContent = s.message || '已是最新版本';
        break;
      case 'error':
        updateBtn.textContent = '检查更新';
        updateBtn.disabled = false;
        updateMsg.textContent = s.message || '检查失败';
        break;
      default:
        updateBtn.textContent = '检查更新';
        updateBtn.disabled = false;
        updateMsg.textContent = '';
    }
  }

  const offUpdateState = window.api.onUpdateState((s) => {
    state = s;
    renderUpdate();
  });

  updateBtn.addEventListener('click', async (e) => {
    e.currentTarget.blur();
    if (state.status === 'dev') {
      updateMsg.textContent = '正在打开发行页…';
      const res = await window.api.openReleases();
      updateMsg.textContent = (res && res.ok) ? '已在浏览器中打开发行页' : (res && res.message) || '打开失败';
      return;
    }
    if (state.status === 'available') {
      updateMsg.textContent = '开始下载…';
      await window.api.downloadUpdate();
      return;
    }
    if (state.status === 'downloaded') {
      await window.api.installUpdate();
      return;
    }
    updateMsg.textContent = '正在检查更新…';
    await window.api.checkUpdate();
  });

  renderUpdate();

  // ===== AI 素材生成配置 =====
  const aiBase = root.querySelector('#ai-base');
  const aiModel = root.querySelector('#ai-model');
  const aiKey = root.querySelector('#ai-key');
  const aiMsg = root.querySelector('[data-s="ai-msg"]');
  const aiSaveBtn = root.querySelector('#ai-save');
  const aiTestBtn = root.querySelector('#ai-test');

  async function refreshAiState() {
    try {
      const cfg = await window.api.aiGetConfig();
      aiKey.placeholder = cfg.hasKey
        ? '已保存（留空表示不修改）'
        : 'API Key（本机加密保存）';
      return cfg;
    } catch {
      return { hasKey: false };
    }
  }

  (async () => {
    try {
      const cfg = await window.api.aiGetConfig();
      aiBase.value = cfg.baseUrl || '';
      aiModel.value = cfg.model || '';
      if (cfg.hasKey) {
        aiKey.placeholder = '已保存（留空表示不修改）';
        aiMsg.textContent = cfg.keyEncrypted ? 'Key 已加密保存' : 'Key 已保存（当前系统不支持加密）';
      }
    } catch {
      aiMsg.textContent = '读取配置失败';
    }
  })();

  root.querySelectorAll('#ai-presets .opt').forEach((b) => {
    b.addEventListener('click', () => {
      aiBase.value = b.dataset.base;
      aiModel.value = b.dataset.model;
      root.querySelectorAll('#ai-presets .opt').forEach((x) => x.classList.toggle('active', x === b));
      aiMsg.textContent = '已填入预设，填好 Key 后点「保存配置」';
    });
  });

  aiSaveBtn.addEventListener('click', async () => {
    aiSaveBtn.disabled = true;
    aiMsg.textContent = '保存中…';
    try {
      await window.api.aiSaveConfig({
        baseUrl: aiBase.value.trim(),
        model: aiModel.value.trim(),
        apiKey: aiKey.value.trim()
      });
      aiKey.value = '';
      const cfg = await refreshAiState();
      if (!cfg.hasKey) aiMsg.textContent = '已保存（还没有 Key，生成时会被拒绝）';
      else aiMsg.textContent = cfg.keyEncrypted ? '已保存，Key 已加密' : '已保存（当前系统不支持加密，明文存储）';
    } catch (err) {
      aiMsg.textContent = `保存失败：${err.message}`;
    } finally {
      aiSaveBtn.disabled = false;
    }
  });

  aiTestBtn.addEventListener('click', async () => {
    aiTestBtn.disabled = true;
    aiMsg.textContent = '正在测试连接…';
    try {
      const res = await window.api.aiTest({
        baseUrl: aiBase.value.trim(),
        model: aiModel.value.trim(),
        apiKey: aiKey.value.trim()
      });
      aiMsg.textContent = res && res.ok ? res.message : `失败：${(res && res.message) || '未知错误'}`;
    } catch (err) {
      aiMsg.textContent = `失败：${err.message}`;
    } finally {
      aiTestBtn.disabled = false;
    }
  });

  root.querySelector('#clear-history').addEventListener('click', async () => {
    if (!confirm('确定清空全部练习记录和课程进度吗？此操作不可恢复。')) return;
    await store.clearHistory();
    const p = await store.progress();
    p.sections = {};
    await store.saveProgress(p);
    alert('已清空');
  });

  root.dataset.ready = '1';
  return {
    cleanup() {
      if (offUpdateState) offUpdateState();
    }
  };
}
