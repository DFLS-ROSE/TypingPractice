import { TypingEngine, evalStars } from './engine.js';
import { VirtualKeyboard } from './keyboard.js';
import { loadJson } from './storage.js';
import { escapeHtml, fmtTime } from './utils.js';

export async function createSession(opts) {
  const {
    text,
    mode = 'strict',
    title = '打字练习',
    subtitle = '',
    showKeyboard = true,
    durationMs = 0,
    starTwo,
    starThree,
    onExit,
    onFinish,
    onNext
  } = opts;

  if (!text || !String(text).length) {
    throw new Error('练习文本为空');
  }

  const root = document.createElement('div');
  root.className = 'session';
  root.innerHTML = `
    <div class="session-head">
      <div>
        <div class="session-title">${escapeHtml(title)}</div>
        <div class="session-meta">${escapeHtml(subtitle)}${durationMs ? ` · 限时 ${Math.round(durationMs / 60000)} 分钟` : ''}${onNext ? ' · 完成后 Enter 下一节' : ''}</div>
      </div>
      <div class="session-tools">
        <div class="mode-switch" title="随时切换严格 / 自由模式">
          <button class="opt" data-mode="strict">严格</button>
          <button class="opt" data-mode="free">自由</button>
        </div>
        <span class="mode-tag" data-s="modetag"></span>
        <button class="btn ghost" data-act="exit">退出 (Esc)</button>
      </div>
    </div>
    <div class="stats-bar">
      <div class="stat"><span class="stat-val" data-s="wpm">0</span><span class="stat-label">WPM</span></div>
      <div class="stat"><span class="stat-val" data-s="cpm">0</span><span class="stat-label">CPM</span></div>
      <div class="stat"><span class="stat-val" data-s="acc">100%</span><span class="stat-label">准确率</span></div>
      <div class="stat"><span class="stat-val" data-s="time">0:00</span><span class="stat-label">用时</span></div>
      <div class="progress"><div class="progress-fill"></div></div>
    </div>
    <div class="typing-area">
      <div class="typing-text"></div>
      <div class="typing-legend">
        <span class="legend-item"><i class="swatch swatch-cur"></i>当前键</span>
        <span class="legend-item"><i class="swatch swatch-err"></i>打错</span>
        <span class="legend-item"><i class="swatch swatch-wrong"></i>红字＝实际打出的字符</span>
      </div>
    </div>
    <div class="keyboard-wrap hidden"></div>
    <div class="session-result hidden">
      <div class="result-title">练习完成</div>
      <div class="result-grid"></div>
      <div class="result-actions">
        ${onNext ? '<button class="btn primary" data-act="next">下一节 (Enter)</button>' : ''}
        <button class="btn${onNext ? '' : ' primary'}" data-act="again">再练一次</button>
        <button class="btn ghost" data-act="exit2">返回</button>
      </div>
    </div>
  `;

  const engine = new TypingEngine(text, { mode });
  const textEl = root.querySelector('.typing-text');
  const spans = [];
  const frag = document.createDocumentFragment();
  for (const ch of String(text)) {
    const sp = document.createElement('span');
    sp.className = 'ch';
    sp.textContent = ch === ' ' ? '\u00A0' : ch;
    frag.appendChild(sp);
    spans.push(sp);
  }
  textEl.appendChild(frag);

  // 打错的字符：位置 → 实际打出的字符，显示在期望字符正上方
  const wrongTyped = new Map();
  const wrongEls = new Array(spans.length).fill(null);

  function displayChar(ch) {
    if (ch === '\n' || ch === 'Enter') return '⏎';
    if (ch === ' ') return '␣';
    return ch;
  }

  function paintWrong(idx) {
    const sp = spans[idx];
    if (!sp) return;
    const typed = wrongTyped.get(idx);
    if (!typed) {
      if (wrongEls[idx]) wrongEls[idx].remove();
      wrongEls[idx] = null;
      return;
    }
    let el = wrongEls[idx];
    if (!el) {
      el = document.createElement('span');
      el.className = 'ch-wrong';
      sp.appendChild(el);
      wrongEls[idx] = el;
    }
    if (el.textContent !== typed) el.textContent = typed;
  }

  let keyboard = null;
  if (showKeyboard) {
    const wrap = root.querySelector('.keyboard-wrap');
    wrap.classList.remove('hidden');
    const layout = opts.layout || (await loadJson('layout.json'));
    keyboard = new VirtualKeyboard(wrap, layout);
    keyboard.setExpected(engine.expected);
  }

  let timer = null;
  let finished = false;

  const modeBtns = Array.from(root.querySelectorAll('.mode-switch .opt'));
  const modeTag = root.querySelector('[data-s="modetag"]');

  function syncMode() {
    modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === engine.mode));
    modeTag.textContent = engine.mode === 'free' ? '自由：可退格' : '严格：错即停';
  }

  function paint() {
    for (let i = 0; i < spans.length; i += 1) {
      const sp = spans[i];
      sp.classList.toggle('done', i < engine.pos);
      sp.classList.toggle('err', i < engine.pos && engine.charErrors[i] > 0);
      sp.classList.toggle('cur', i === engine.pos && !engine.finished);
      paintWrong(i);
    }
    const cur = spans[engine.pos];
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function paintStats() {
    const s = engine.stats();
    root.querySelector('[data-s="wpm"]').textContent = String(s.wpm);
    root.querySelector('[data-s="cpm"]').textContent = String(s.cpm);
    root.querySelector('[data-s="acc"]').textContent = `${s.accuracy}%`;
    root.querySelector('[data-s="time"]').textContent = fmtTime(s.elapsedMs);
    root.querySelector('.progress-fill').style.width = `${(s.progress * 100).toFixed(1)}%`;
    return s;
  }

  engine.onChange = () => {
    paint();
    paintStats();
    if (keyboard) keyboard.setExpected(engine.expected);
    if (engine.finished && !finished) finish(false);
  };

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
      if (onExit) onExit();
      return;
    }
    if (finished) {
      if (e.key === 'Enter' && onNext) {
        e.preventDefault();
        onNext();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const consumable = e.key.length === 1 || ['Backspace', 'Tab', 'Enter'].includes(e.key);
    if (consumable) e.preventDefault();
    const res = engine.handleKey(e.key, e);
    if (res.type === 'correct' && keyboard) keyboard.flash(e.key === 'Enter' ? '\n' : e.key);
    if (res.type === 'error') {
      if (keyboard) keyboard.flashError(res.expected);
      const idx = engine.mode === 'free' ? engine.pos - 1 : engine.pos;
      const sp = spans[idx];
      if (sp) {
        sp.classList.add('wrong');
        setTimeout(() => sp.classList.remove('wrong'), 300);
      }
      // 把实际打出的字符记下来，显示在期望字符上方
      wrongTyped.set(idx, displayChar(res.typed));
      paintWrong(idx);
    }
  }

  async function finish(timedOut) {
    if (finished) return;
    finished = true;
    if (timer) clearInterval(timer);
    if (!engine.finished) {
      engine.finished = true;
      engine.finishedAt = performance.now();
    }
    const s = engine.stats();
    paint();
    const stars = timedOut ? 0 : evalStars(s, starTwo, starThree);
    const resultEl = root.querySelector('.session-result');
    resultEl.classList.remove('hidden');
    resultEl.querySelector('.result-title').textContent = timedOut ? '时间到' : '练习完成';
    resultEl.querySelector('.result-grid').innerHTML = `
      <div class="result-item"><div class="result-num">${s.wpm}</div><div class="result-label">WPM</div></div>
      <div class="result-item"><div class="result-num">${s.cpm}</div><div class="result-label">CPM</div></div>
      <div class="result-item"><div class="result-num">${s.accuracy}%</div><div class="result-label">准确率</div></div>
      <div class="result-item"><div class="result-num">${fmtTime(s.elapsedMs)}</div><div class="result-label">用时</div></div>
      <div class="result-item"><div class="result-num stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div><div class="result-label">星级</div></div>
    `;
    if (onFinish) await onFinish(s);
  }

  function startTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      const s = paintStats();
      if (durationMs && s.elapsedMs >= durationMs) finish(true);
    }, 200);
  }

  function cleanup() {
    if (timer) clearInterval(timer);
    timer = null;
    window.removeEventListener('keydown', onKeyDown);
  }

  // 切到别的页面时：暂停计时、摘掉键盘监听，进度原样保留
  function pause() {
    if (finished) return;
    engine.pause();
    if (timer) { clearInterval(timer); timer = null; }
    window.removeEventListener('keydown', onKeyDown);
  }

  function resume() {
    if (finished) return;
    engine.resume();
    window.addEventListener('keydown', onKeyDown);
    if (!timer) startTimer();
    paint();
    paintStats();
  }

  modeBtns.forEach((b) => {
    b.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (finished) return;
      engine.mode = b.dataset.mode;
      syncMode();
      paint();
    });
  });
  syncMode();

  root.querySelector('[data-act="exit"]').addEventListener('click', (e) => {
    e.currentTarget.blur();
    cleanup();
    if (onExit) onExit();
  });
  root.querySelector('[data-act="exit2"]').addEventListener('click', (e) => {
    e.currentTarget.blur();
    cleanup();
    if (onExit) onExit();
  });
  root.querySelector('[data-act="again"]').addEventListener('click', (e) => {
    e.currentTarget.blur();
    finished = false;
    engine.reset();
    wrongTyped.clear();
    root.querySelector('.session-result').classList.add('hidden');
    paint();
    paintStats();
    if (keyboard) keyboard.setExpected(engine.expected);
    startTimer();
  });
  const nextBtn = root.querySelector('[data-act="next"]');
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (onNext) onNext();
    });
  }

  window.addEventListener('keydown', onKeyDown);
  paint();
  paintStats();
  startTimer();

  return {
    root,
    cleanup,
    pause,
    resume,
    isFinished: () => finished
  };
}
