// 反应训练的纯逻辑（UI 在 views/reaction.js，这里单独拆出来方便单测）
//
// 玩法：屏幕中央出现一个随机字符，盯住它并立刻按下对应的键。
// 记录「字符出现 → 键按下」之间的毫秒数（这就是反应时），
// 每次按对计一条，最后按平均反应时间给分、评级、星级。
//
// 评分口径：难度越高，需要按的键越难找（Shift / 数字键），反应天然更慢，
// 所以每档难度有各自的「满分线」；零分线统一 1000ms。
//   纯小写        600ms 满分
//   大小写混排    700ms 满分
//   大小写数字    800ms 满分
// 分数 = (1000 - rt) / (1000 - 满分线) × 100，超出区间截断到 0–100。

export const ZERO_MS = 1000;

// 默认一轮练多少个字符
export const DEFAULT_COUNT = 20;

// 超过这个毫秒数认为走神了（切窗口、发呆），该次不计入成绩，重新测这个字符
export const MAX_REACTION_MS = 3000;

export const DIFFICULTIES = [
  {
    id: 'lower',
    label: '纯小写',
    chars: 'abcdefghijklmnopqrstuvwxyz',
    fullMs: 600,
    // 平均反应时间的星级阈值（≤ 各值分别给 3 / 2 / 1 星）
    stars: [200, 260, 350]
  },
  {
    id: 'mixed',
    label: '大小写混排',
    chars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    fullMs: 700,
    stars: [250, 320, 420]
  },
  {
    id: 'full',
    label: '大小写数字',
    chars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    fullMs: 800,
    stars: [300, 380, 480]
  }
];

export const DEFAULT_DIFFICULTY = 'lower';

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];
}

// 单次反应时间 → 0-100 分（满分线得 100 分，零分线 1000ms 得 0 分，中间线性）
export function scoreForRt(rt, fullMs = 600) {
  if (!Number.isFinite(rt) || rt <= 0) return 0;
  const span = ZERO_MS - fullMs;
  if (span <= 0) return rt <= fullMs ? 100 : 0;
  const s = ((ZERO_MS - rt) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(s)));
}

// 总分 → 评级
export function gradeFor(score) {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

// 平均反应时间 → 星级（阈值按难度给）
export function starsFor(avgRt, thresholds = [200, 260, 350]) {
  if (!Number.isFinite(avgRt) || avgRt <= 0) return 0;
  if (avgRt <= thresholds[0]) return 3;
  if (avgRt <= thresholds[1]) return 2;
  if (avgRt <= thresholds[2]) return 1;
  return 0;
}

export function commentFor(grade) {
  switch (grade) {
    case 'S': return '闪电级反应，手指比眼睛还快';
    case 'A': return '反应很快，保持这个状态';
    case 'B': return '不错，再压一点反应时间就能上一档';
    case 'C': return '还行的基础，先盯住字符再动手';
    default: return '别急，放松手指，专注看准那个字符';
  }
}

// 汇总一次训练：rts 是每次按对的反应时间（毫秒）
export function summarize(rts, mistakes = 0, difficulty = DIFFICULTIES[0]) {
  const list = (rts || []).filter((n) => Number.isFinite(n) && n > 0);
  if (!list.length) {
    return { count: 0, avg: 0, best: 0, worst: 0, score: 0, grade: 'D', stars: 0, accuracy: 0 };
  }
  const sum = list.reduce((a, b) => a + b, 0);
  const avg = sum / list.length;
  const score = Math.round(
    list.reduce((a, rt) => a + scoreForRt(rt, difficulty.fullMs), 0) / list.length
  );
  const attempts = list.length + (mistakes || 0);
  return {
    count: list.length,
    avg: Math.round(avg),
    best: Math.round(Math.min(...list)),
    worst: Math.round(Math.max(...list)),
    score,
    grade: gradeFor(score),
    stars: starsFor(avg, difficulty.stars),
    accuracy: attempts ? Math.round((list.length / attempts) * 1000) / 10 : 100
  };
}

export function fmtRt(ms) {
  return `${Math.round(ms)} ms`;
}
