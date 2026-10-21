export class TypingEngine {
  constructor(text, options = {}) {
    this.text = String(text == null ? '' : text);
    this.mode = options.mode === 'free' ? 'free' : 'strict';
    this.onChange = null;
    this.reset();
  }

  reset() {
    this.pos = 0;
    this.charErrors = new Array(this.text.length).fill(0);
    this.keystrokes = 0;
    this.mistakes = 0;
    this.keyErrors = {};
    this.startedAt = null;
    this.finishedAt = null;
    this.finished = false;
    this.pausedAt = null;
    this._emit();
  }

  get expected() {
    return this.finished ? null : this.text[this.pos];
  }

  get elapsedMs() {
    if (!this.startedAt) return 0;
    const end = this.pausedAt != null ? this.pausedAt : (this.finishedAt || performance.now());
    return Math.max(0, end - this.startedAt);
  }

  // 暂停：计时停住，暂停时长不计入用时
  pause() {
    if (this.pausedAt != null || this.finished) return;
    this.pausedAt = performance.now();
  }

  resume() {
    if (this.pausedAt == null) return;
    const delta = performance.now() - this.pausedAt;
    this.pausedAt = null;
    if (this.startedAt != null) this.startedAt += delta;
  }

  get paused() {
    return this.pausedAt != null;
  }

  handleKey(key, event) {
    if (this.finished) return { type: 'done' };
    if (this.paused) return { type: 'ignored' };
    if (event && (event.ctrlKey || event.metaKey || event.altKey)) return { type: 'ignored' };
    if (event && event.repeat) return { type: 'ignored' };
    if (key === 'Dead' || key === 'Unidentified' || key === 'CapsLock') return { type: 'ignored' };
    if (/^F\d{1,2}$/.test(key) || ['Tab', 'Escape', 'ContextMenu'].includes(key)) return { type: 'ignored' };
    if (this.text.length === 0) return { type: 'ignored' };

    if (key === 'Backspace') {
      if (this.mode === 'free' && this.pos > 0) {
        // 只回退位置，错误记录保留：改对仍算错过（准确率照罚、该位仍标红）
        this.pos -= 1;
        this._emit();
        return { type: 'back' };
      }
      return { type: 'ignored' };
    }

    if (key !== 'Enter' && key.length !== 1) return { type: 'ignored' };

    if (!this.startedAt) this.startedAt = performance.now();

    const expected = this.text[this.pos];
    const typed = key === 'Enter' ? '\n' : key;
    this.keystrokes += 1;

    if (typed === expected) {
      this.pos += 1;
      if (this.pos >= this.text.length) {
        this.finished = true;
        this.finishedAt = performance.now();
      }
      this._emit();
      return { type: 'correct', expected };
    }

    this.mistakes += 1;
    const errKey = expected === '\n' ? 'Enter' : expected;
    this.keyErrors[errKey] = (this.keyErrors[errKey] || 0) + 1;

    if (this.mode === 'free') {
      this.charErrors[this.pos] += 1;
      this.pos += 1;
      if (this.pos >= this.text.length) {
        this.finished = true;
        this.finishedAt = performance.now();
      }
    } else {
      this.charErrors[this.pos] += 1;
    }
    this._emit();
    return { type: 'error', expected, typed };
  }

  stats() {
    const minutes = this.elapsedMs / 60000;
    const typedCorrect = this.charErrors
      .slice(0, this.pos)
      .reduce((n, e) => n + (e === 0 ? 1 : 0), 0);
    const wpm = minutes > 0 ? Math.max(0, Math.round(typedCorrect / 5 / minutes)) : 0;
    const cpm = minutes > 0 ? Math.max(0, Math.round(typedCorrect / minutes)) : 0;
    const accuracy = this.keystrokes > 0
      ? Math.round(((this.keystrokes - this.mistakes) / this.keystrokes) * 1000) / 10
      : 100;
    return {
      wpm,
      cpm,
      accuracy,
      progress: this.text.length ? this.pos / this.text.length : 0,
      typed: this.pos,
      total: this.text.length,
      keystrokes: this.keystrokes,
      mistakes: this.mistakes,
      elapsedMs: this.elapsedMs,
      finished: this.finished,
      paused: this.paused,
      keyErrors: { ...this.keyErrors }
    };
  }

  _emit() {
    if (this.onChange) this.onChange(this.stats());
  }
}

export function evalStars(stats, two, three) {
  if (!stats.finished) return 0;
  if (three && stats.wpm >= three.wpm && stats.accuracy >= three.accuracy) return 3;
  if (two && stats.wpm >= two.wpm && stats.accuracy >= two.accuracy) return 2;
  return 1;
}
