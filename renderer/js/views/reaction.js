import { store } from '../storage.js';
import {
  DIFFICULTIES,
  DEFAULT_DIFFICULTY,
  difficultyById,
  DEFAULT_COUNT,
  MAX_REACTION_MS,
  summarize,
  commentFor,
  fmtRt
} from '../reaction.js';

// 反应训练：屏幕中央一个随机字符，按下对应键即记录一次反应时间。
// 走时完全独立于 session.js 的字符流练习，不走 WPM/准确率那套。
export async function renderReactionView(ctx) {
  const root = document.createElement('div');
  root.className = 'view';
  root.innerHTML = `
    <div class="panel reaction-panel">
      <div class="panel-title">反应训练</div>
      <div class="reaction-body">
        <p class="reaction-lead">屏幕中央会冒出一个随机字符，盯住它、立刻按下对应的键。练的是「看到 → 动手」的延迟，和打字速度是两种能力。难度越高需要按的键越难找，满分线也相应放宽。</p>

        <div class="opt-row">
          <span class="opt-label">难度</span>
          <div class="opt-group" id="rx-diff">
            ${DIFFICULTIES.map((d, i) => `
              <button class="opt${i === 0 ? ' active' : ''}" data-d="${d.id}" title="满分线 ${d.fullMs} ms">${d.label}</button>
            `).join('')}
          </div>
        </div>
        <div class="opt-row">
          <span class="opt-label">训练长度</span>
          <div class="opt-group" id="rx-count">
            <button class="opt" data-n="10">10 个</button>
            <button class="opt active" data-n="20">20 个</button>
            <button class="opt" data-n="30">30 个</button>
          </div>
          <button class="btn primary" id="rx-start">开始训练</button>
        </div>

        <div class="reaction-stage">
          <div class="reaction-char" id="rx-char">·</div>
          <div class="reaction-hint" id="rx-hint">点「开始训练」，字符会出现在这里</div>
        </div>

        <div class="reaction-stats">
          <div class="rx-stat"><span class="k">已完成</span><span class="v" id="rx-done">0 / ${DEFAULT_COUNT}</span></div>
          <div class="rx-stat"><span class="k">上次反应</span><span class="v" id="rx-last">—</span></div>
          <div class="rx-stat"><span class="k">平均反应</span><span class="v" id="rx-avg">—</span></div>
          <div class="rx-stat"><span class="k">失误</span><span class="v" id="rx-miss">0</span></div>
        </div>

        <div class="reaction-best" id="rx-best"></div>

        <div class="session-result hidden" id="rx-result">
          <div class="result-title">训练完成</div>
          <div class="result-grid" id="rx-grid"></div>
          <p class="reaction-comment" id="rx-comment"></p>
          <div class="result-actions">
            <button class="btn primary" id="rx-again">再来一次</button>
          </div>
        </div>
      </div>
    </div>
  `;
  ctx.content.appendChild(root);

  const charEl = root.querySelector('#rx-char');
  const hintEl = root.querySelector('#rx-hint');
  const doneEl = root.querySelector('#rx-done');
  const lastEl = root.querySelector('#rx-last');
  const avgEl = root.querySelector('#rx-avg');
  const missEl = root.querySelector('#rx-miss');
  const bestEl = root.querySelector('#rx-best');
  const resultEl = root.querySelector('#rx-result');
  const gridEl = root.querySelector('#rx-grid');
  const commentEl = root.querySelector('#rx-comment');
  const startBtn = root.querySelector('#rx-start');

  let count = DEFAULT_COUNT;
  let diffId = DEFAULT_DIFFICULTY;
  let difficulty = difficultyById(diffId);
  let running = false;
  let char = '';
  let shownAt = 0;
  let rts = [];
  let mistakes = 0;
  let lastRt = 0;
  let countdownTimer = null;

  const progress = await store.progress();
  // 记录结构：{ best: { 难度id: {...} }, runs: [...] }；旧版本 best 是单个对象，按纯小写迁移
  const reactionState = progress.reaction || { best: {}, runs: [] };
  if (reactionState.best && typeof reactionState.best.score === 'number') {
    reactionState.best = { lower: reactionState.best };
  }
  reactionState.best = reactionState.best || {};
  reactionState.runs = Array.isArray(reactionState.runs) ? reactionState.runs : [];

  function renderBest() {
    const b = reactionState.best[diffId];
    bestEl.textContent = b
      ? `${difficulty.label}最佳纪录 ${b.score} 分 · ${b.grade} 级（平均 ${b.avg} ms）`
      : `${difficulty.label}还没有记录，练一次看看`;
  }
  renderBest();

  function updateStats() {
    doneEl.textContent = `${rts.length} / ${count}`;
    lastEl.textContent = lastRt ? fmtRt(lastRt) : '—';
    const avg = rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : 0;
    avgEl.textContent = avg ? fmtRt(avg) : '—';
    missEl.textContent = String(mistakes);
  }

  function nextChar() {
    const pool = difficulty.chars;
    char = pool[Math.floor(Math.random() * pool.length)];
    charEl.textContent = char;
    charEl.classList.remove('wrong');
    shownAt = performance.now();
    hintEl.textContent = '按下这个键';
  }

  function clearCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  // 开始前倒数 3 秒，避免第一个字符因为没准备好而显得慢
  function startCountdown() {
    clearCountdown();
    let n = 3;
    charEl.textContent = String(n);
    charEl.classList.remove('wrong');
    hintEl.textContent = '准备…';
    countdownTimer = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearCountdown();
        nextChar();
      } else {
        charEl.textContent = String(n);
      }
    }, 1000);
  }

  function start() {
    rts = [];
    mistakes = 0;
    lastRt = 0;
    resultEl.classList.add('hidden');
    updateStats();
    running = true;
    startCountdown();
    window.addEventListener('keydown', onKey);
    startBtn.textContent = '重新开始';
  }

  function stop() {
    running = false;
    clearCountdown();
    window.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!running) return;
    if (e.key === 'Escape') {
      stop();
      charEl.textContent = '·';
      hintEl.textContent = '已暂停，点「开始训练」重新开始';
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = String(e.key || '');
    if (k.length !== 1) return;
    e.preventDefault();

    const rt = performance.now() - shownAt;

    if (k !== char) {
      // 按错：记一次失误，字符不变，重新计时（防止乱按刷分）
      mistakes += 1;
      charEl.classList.add('wrong');
      updateStats();
      shownAt = performance.now();
      setTimeout(() => charEl.classList.remove('wrong'), 260);
      hintEl.textContent = '按错了，再按一次正确的';
      return;
    }

    if (rt > MAX_REACTION_MS) {
      // 走神（切窗口、发呆）：这次不计入成绩，这个字符重测
      shownAt = performance.now();
      hintEl.textContent = '刚刚走神了，这个字符再来一次';
      return;
    }

    rts.push(rt);
    lastRt = rt;
    updateStats();
    if (rts.length >= count) {
      finish();
      return;
    }
    nextChar();
  }

  async function finish() {
    stop();
    const sum = summarize(rts, mistakes, difficulty);

    reactionState.runs = reactionState.runs
      .concat([{
        ts: Date.now(),
        score: sum.score,
        avg: sum.avg,
        grade: sum.grade,
        count: sum.count,
        difficulty: diffId
      }])
      .slice(-20);
    const cur = reactionState.best[diffId];
    if (!cur || sum.score > cur.score) {
      reactionState.best[diffId] = { score: sum.score, avg: sum.avg, grade: sum.grade, ts: Date.now() };
    }
    const p = await store.progress();
    p.reaction = reactionState;
    await store.saveProgress(p);
    renderBest();

    gridEl.innerHTML = `
      <div class="result-item"><div class="result-num" id="rx-score">${sum.score}</div><div class="result-label">总分</div></div>
      <div class="result-item"><div class="result-num" id="rx-grade">${sum.grade}</div><div class="result-label">评级</div></div>
      <div class="result-item"><div class="result-num">${difficulty.label}</div><div class="result-label">难度（满分线 ${difficulty.fullMs} ms）</div></div>
      <div class="result-item"><div class="result-num">${sum.avg}</div><div class="result-label">平均反应 (ms)</div></div>
      <div class="result-item"><div class="result-num">${sum.best}</div><div class="result-label">最快 (ms)</div></div>
      <div class="result-item"><div class="result-num">${sum.worst}</div><div class="result-label">最慢 (ms)</div></div>
      <div class="result-item"><div class="result-num">${sum.accuracy}%</div><div class="result-label">准确率</div></div>
      <div class="result-item"><div class="result-num stars">${'★'.repeat(sum.stars)}${'☆'.repeat(3 - sum.stars)}</div><div class="result-label">星级</div></div>
    `;
    commentEl.textContent = commentFor(sum.grade);
    resultEl.classList.remove('hidden');
  }

  root.querySelectorAll('#rx-diff .opt').forEach((b) => {
    b.addEventListener('click', () => {
      root.querySelectorAll('#rx-diff .opt').forEach((x) => x.classList.toggle('active', x === b));
      diffId = b.dataset.d;
      difficulty = difficultyById(diffId);
      renderBest();
      if (running) {
        // 难度变了，当前这一轮作废，从倒数重新开始
        stop();
        start();
      }
    });
  });
  root.querySelectorAll('#rx-count .opt').forEach((b) => {
    b.addEventListener('click', () => {
      root.querySelectorAll('#rx-count .opt').forEach((x) => x.classList.toggle('active', x === b));
      count = Number(b.dataset.n) || DEFAULT_COUNT;
      updateStats();
    });
  });
  startBtn.addEventListener('click', start);
  root.querySelector('#rx-again').addEventListener('click', start);

  updateStats();
  root.dataset.ready = '1';

  return {
    cleanup() {
      stop();
    }
  };
}
