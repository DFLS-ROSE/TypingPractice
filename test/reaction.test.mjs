import {
  scoreForRt,
  gradeFor,
  starsFor,
  summarize,
  commentFor,
  DIFFICULTIES,
  ZERO_MS
} from '../renderer/js/reaction.js';

let pass = 0;
let fail = 0;

function check(name, cond) {
  if (cond) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}`);
  }
}

const lower = DIFFICULTIES[0];
const mixed = DIFFICULTIES[1];
const full = DIFFICULTIES[2];

// 难度定义
check('难度: 共三档', DIFFICULTIES.length === 3);
check('难度: 满分线 600 / 700 / 800 递增', lower.fullMs === 600 && mixed.fullMs === 700 && full.fullMs === 800);
check('难度: 零分线统一 1000ms', ZERO_MS === 1000);
check('难度: 字符池逐档变大', lower.chars.length === 26 && mixed.chars.length === 52 && full.chars.length === 62);

// 单次反应时间 → 分数（满分线得 100 分，零分线 1000ms 得 0 分，中间线性）
check('反应分: 满分线得 100 分', scoreForRt(600, 600) === 100);
check('反应分: 零分线得 0 分', scoreForRt(1000, 600) === 0);
check('反应分: 中点得 50 分', scoreForRt(800, 600) === 50);
check('反应分: 快于满分线截断为 100', scoreForRt(400, 600) === 100);
check('反应分: 慢于零分线截断为 0', scoreForRt(1200, 600) === 0);
check('反应分: 大小写档满分线 700ms', scoreForRt(700, 700) === 100 && scoreForRt(900, 700) === 33);
check('反应分: 数字档满分线 800ms', scoreForRt(800, 800) === 100);
check('反应分: 非法输入返回 0', scoreForRt(0) === 0 && scoreForRt(-50) === 0 && scoreForRt(NaN) === 0);

// 分数 → 评级
check('评级: 90 分以上为 S', gradeFor(90) === 'S' && gradeFor(100) === 'S');
check('评级: 80–89 为 A', gradeFor(89) === 'A' && gradeFor(80) === 'A');
check('评级: 65–79 为 B', gradeFor(79) === 'B' && gradeFor(65) === 'B');
check('评级: 50–64 为 C', gradeFor(64) === 'C' && gradeFor(50) === 'C');
check('评级: 50 以下为 D', gradeFor(49) === 'D' && gradeFor(0) === 'D');

// 平均反应时间 → 星级（阈值按难度给）
check('星级: 纯小写 200ms 内 3 星', starsFor(200, lower.stars) === 3 && starsFor(150, lower.stars) === 3);
check('星级: 纯小写 260ms 内 2 星', starsFor(260, lower.stars) === 2 && starsFor(201, lower.stars) === 2);
check('星级: 纯小写 350ms 内 1 星', starsFor(350, lower.stars) === 1 && starsFor(261, lower.stars) === 1);
check('星级: 更慢或无效为 0 星', starsFor(351, lower.stars) === 0 && starsFor(0, lower.stars) === 0);
check('星级: 难度越高阈值越宽松', starsFor(320, lower.stars) === 1 && starsFor(320, full.stars) === 2);

// 汇总
const empty = summarize([], 0, lower);
check('汇总: 无数据时全为 0', empty.count === 0 && empty.avg === 0 && empty.score === 0 && empty.grade === 'D');

const mid = summarize([200, 240, 260], 0, lower);
check('汇总: 次数/平均/最快/最慢', mid.count === 3 && mid.avg === 233 && mid.best === 200 && mid.worst === 260);
check('汇总: 满分线内为满分 S 级', mid.score === 100 && mid.grade === 'S');
check('汇总: 平均 233ms 为 2 星', mid.stars === 2);

const slow = summarize([900, 950], 0, lower);
check('汇总: 慢速低分 D 级 0 星', slow.score === 19 && slow.grade === 'D' && slow.stars === 0);

const wrong = summarize([400], 1, lower);
check('汇总: 失误计入准确率', wrong.accuracy === 50);

check('评价语: 每个评级都有文案', ['S', 'A', 'B', 'C', 'D'].every((g) => commentFor(g).length > 0));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
