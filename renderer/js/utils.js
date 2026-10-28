export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// 内联确认气泡：替代 window.confirm
// Electron 里 confirm / alert 会弹系统对话框（等于新开一个窗口打断操作），
// 这里改成贴着按钮浮出的小气泡，点外部 / Esc 取消
let popEl = null;
let popCleanup = null;

export function closePopConfirm() {
  if (popCleanup) {
    popCleanup();
    popCleanup = null;
  }
  if (popEl && popEl.parentNode) popEl.parentNode.removeChild(popEl);
  popEl = null;
}

export function popConfirm(anchor, message, onConfirm, opts = {}) {
  closePopConfirm();
  if (!anchor) return;
  const { confirmText = '确定', cancelText = '取消' } = opts;

  const pop = document.createElement('div');
  pop.className = 'popconfirm';
  pop.innerHTML = `
    <div class="popconfirm-msg">${escapeHtml(message)}</div>
    <div class="popconfirm-actions">
      <button class="btn pop-btn" data-act="cancel">${escapeHtml(cancelText)}</button>
      <button class="btn pop-btn danger" data-act="ok">${escapeHtml(confirmText)}</button>
    </div>
  `;
  document.body.appendChild(pop);

  // 贴在 anchor 右侧，空间不够就翻到左侧；垂直居中对齐并夹在视口内
  const rect = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  let left = rect.right + 8;
  if (left + pw > window.innerWidth - 8) left = Math.max(8, rect.left - pw - 8);
  let top = rect.top + rect.height / 2 - ph / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;

  const onDocDown = (e) => {
    if (pop.contains(e.target) || anchor === e.target || anchor.contains(e.target)) return;
    closePopConfirm();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      closePopConfirm();
    }
  };
  const onScroll = () => closePopConfirm();

  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', onScroll, true);
  popCleanup = () => {
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', onScroll, true);
  };

  pop.querySelector('[data-act="cancel"]').addEventListener('click', closePopConfirm);
  pop.querySelector('[data-act="ok"]').addEventListener('click', () => {
    closePopConfirm();
    onConfirm();
  });

  popEl = pop;
}

export function fmtDateTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
