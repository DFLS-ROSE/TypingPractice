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

  root.querySelector('#clear-history').addEventListener('click', async () => {
    if (!confirm('确定清空全部练习记录和课程进度吗？此操作不可恢复。')) return;
    await store.clearHistory();
    const p = await store.progress();
    p.sections = {};
    await store.saveProgress(p);
    alert('已清空');
  });

  return { cleanup() {} };
}
