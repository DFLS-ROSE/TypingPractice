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
