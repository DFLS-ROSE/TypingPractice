import { TypingEngine, evalStars } from '../renderer/js/engine.js';

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

function keyEvent(overrides = {}) {
  return Object.assign({ ctrlKey: false, metaKey: false, altKey: false, repeat: false }, overrides);
}

const strict = new TypingEngine('abc', { mode: 'strict' });
check('strict: 初始位置为 0', strict.pos === 0);
check('strict: 初始未完成', strict.finished === false);
strict.handleKey('a', keyEvent());
check('strict: 按对前进', strict.pos === 1);
const wrong = strict.handleKey('x', keyEvent());
check('strict: 按错返回 error', wrong.type === 'error');
check('strict: 按错不前进', strict.pos === 1);
check('strict: keyErrors 记录应按字符', strict.stats().keyErrors.b === 1);
strict.handleKey('b', keyEvent());
strict.handleKey('c', keyEvent());
check('strict: 文本结束即完成', strict.finished === true && strict.pos === 3);
check('strict: 准确率按总击键计算', strict.stats().accuracy === 75);

const free = new TypingEngine('abc', { mode: 'free' });
free.handleKey('a', keyEvent());
free.handleKey('x', keyEvent());
check('free: 按错也前进', free.pos === 2);
check('free: 错误位置被记录', free.charErrors[1] === 1);
free.handleKey('Backspace', keyEvent());
check('free: 退格回退', free.pos === 1);
free.handleKey('Backspace', keyEvent());
free.handleKey('Backspace', keyEvent());
check('free: 退格到底即停', free.pos === 0);
free.handleKey('a', keyEvent());
free.handleKey('b', keyEvent());
free.handleKey('c', keyEvent());
check('free: 文本结束即完成', free.finished === true);

const shift = new TypingEngine('A\n', { mode: 'strict' });
shift.handleKey('A', keyEvent());
check('大写字母可匹配', shift.pos === 1);
shift.handleKey('Enter', keyEvent());
check('Enter 映射为换行', shift.finished === true && shift.pos === 2);

const ign = new TypingEngine('abc', { mode: 'strict' });
ign.handleKey('Tab', keyEvent());
check('Tab 被忽略', ign.pos === 0);
ign.handleKey('F5', keyEvent());
check('F5 被忽略', ign.pos === 0);
ign.handleKey('a', keyEvent({ ctrlKey: true }));
check('Ctrl 组合键被忽略', ign.pos === 0);
ign.handleKey('a', keyEvent({ repeat: true }));
check('长按重复被忽略', ign.pos === 0);
ign.handleKey('a', keyEvent());
ign.handleKey('a', keyEvent({ repeat: true }));
check('重复不导致连进', ign.pos === 1);

const two = { wpm: 15, accuracy: 90 };
const three = { wpm: 25, accuracy: 95 };
check('星级: 双达标给 3 星', evalStars({ finished: true, wpm: 30, accuracy: 96 }, two, three) === 3);
check('星级: 仅二星达标给 2 星', evalStars({ finished: true, wpm: 20, accuracy: 92 }, two, three) === 2);
check('星级: 完成但未达标给 1 星', evalStars({ finished: true, wpm: 5, accuracy: 80 }, two, three) === 1);
check('星级: 未完成给 0 星', evalStars({ finished: false, wpm: 30, accuracy: 96 }, two, three) === 0);

// 自由模式退格：只回退位置，错误记录保留（改对仍算错过）
const fix = new TypingEngine('abc', { mode: 'free' });
fix.handleKey('a', keyEvent());
fix.handleKey('Z', keyEvent());
check('free: 打错后记录错误', fix.charErrors[1] === 1);
fix.handleKey('Backspace', keyEvent());
check('free: 退格只回退位置', fix.pos === 1);
fix.handleKey('b', keyEvent());
check('free: 退格后改对仍保留错误记录', fix.charErrors[1] === 1 && fix.pos === 2);

const fix2 = new TypingEngine('abc', { mode: 'free' });
fix2.handleKey('a', keyEvent());
fix2.handleKey('Z', keyEvent());
fix2.handleKey('Backspace', keyEvent());
fix2.handleKey('Q', keyEvent());
check('free: 退格后改错同样保留记录（累计两次错误）', fix2.charErrors[1] === 2 && fix2.pos === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
