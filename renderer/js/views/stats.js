import { store } from '../storage.js';
import { escapeHtml, fmtDateTime, fmtTime } from '../utils.js';

function starsHtml(n) {
  const stars = Math.max(0, Math.min(3, n || 0));
  return `<span class="stars">${'★'.repeat(stars)}<span class="star-off">${'☆'.repeat(3 - stars)}</span></span>`;
}

export async function renderStatsView(ctx) {
  const root = document.createElement('div');
  root.className = 'view';
  root.innerHTML = `
    <div class="panel stats-panel">
      <div class="panel-title">成绩统计</div>
      <div class="stats-body"><div class="muted">加载中…</div></div>
    </div>
  `;
  ctx.content.appendChild(root);

  const body = root.querySelector('.stats-body');

  let history;
  let progress;
  try {
    [history, progress] = await Promise.all([store.history(), store.progress()]);
  } catch (err) {
    body.innerHTML = `<div class="error-panel">加载失败：${escapeHtml(err.message)}</div>`;
    return { cleanup() {} };
  }

  if (!history.length) {
    body.innerHTML = `
      <div class="empty-hint">
        <p>还没有练习记录。</p>
        <p>去「打字教程」完成一节课，或在「素材练习」里练一段文章，成绩就会出现在这里。</p>
      </div>
    `;
    return { cleanup() {} };
  }

  const totalMs = history.reduce((n, r) => n + (r.durationMs || 0), 0);
  const bestWpm = history.reduce((n, r) => Math.max(n, r.wpm || 0), 0);
  const avgAcc = Math.round((history.reduce((n, r) => n + (r.accuracy || 0), 0) / history.length) * 10) / 10;

  const recent = history.slice(-30);
  const maxWpm = Math.max(...recent.map((r) => r.wpm || 0), 1);
  const points = recent
    .map((r, i) => {
      const x = recent.length === 1 ? 340 : 40 + (i / (recent.length - 1)) * 600;
      const y = 132 - ((r.wpm || 0) / maxWpm) * 112;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const rows = history
    .slice()
    .reverse()
    .slice(0, 20)
    .map((r) => `
      <tr>
        <td>${fmtDateTime(r.ts)}</td>
        <td>${escapeHtml(r.label || r.source || '')}</td>
        <td>${r.wpm}</td>
        <td>${r.cpm}</td>
        <td>${r.accuracy}%</td>
        <td>${fmtTime(r.durationMs || 0)}</td>
      </tr>
    `)
    .join('');

  const sectionEntries = Object.entries(progress.sections || {})
    .sort((a, b) => (b[1].runs || 0) - (a[1].runs || 0))
    .slice(0, 10);
  const sectionRows = sectionEntries
    .map(([id, s]) => `
      <tr>
        <td>${escapeHtml(id)}</td>
        <td>${starsHtml(s.stars)}</td>
        <td>${s.runs || 0}</td>
        <td>${s.bestWpm || 0}</td>
        <td>${s.bestAcc || 0}%</td>
      </tr>
    `)
    .join('');

  body.innerHTML = `
    <div class="summary-cards">
      <div class="card"><div class="card-num">${history.length}</div><div class="card-label">练习次数</div></div>
      <div class="card"><div class="card-num">${fmtTime(totalMs)}</div><div class="card-label">累计时长</div></div>
      <div class="card"><div class="card-num">${bestWpm}</div><div class="card-label">最佳 WPM</div></div>
      <div class="card"><div class="card-num">${avgAcc}%</div><div class="card-label">平均准确率</div></div>
    </div>
    <div class="section-block">
      <h3>WPM 趋势（最近 ${recent.length} 次）</h3>
      <svg viewBox="0 0 680 160" class="trend" role="img">
        <line x1="40" y1="140" x2="640" y2="140" stroke="#e4e7ec" stroke-width="1"/>
        <polyline points="${points}" fill="none" stroke="#185fa5" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
    </div>
    <div class="section-block">
      <h3>最近记录</h3>
      <table class="table">
        <thead><tr><th>时间</th><th>内容</th><th>WPM</th><th>CPM</th><th>准确率</th><th>时长</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${sectionRows ? `
    <div class="section-block">
      <h3>课程进度</h3>
      <table class="table">
        <thead><tr><th>课程</th><th>星级</th><th>练习次数</th><th>最佳 WPM</th><th>最佳准确率</th></tr></thead>
        <tbody>${sectionRows}</tbody>
      </table>
    </div>` : ''}
  `;

  return { cleanup() {} };
}
