import { escapeHtml } from './utils.js';

export class VirtualKeyboard {
  constructor(container, layout) {
    this.container = container;
    this.layout = layout;
    this.keyEls = [];
    this.keyDefs = [];
    this._build();
  }

  _build() {
    this.container.innerHTML = '';
    this.container.classList.add('vkeyboard');
    for (const row of this.layout.rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'vkb-row';
      for (const key of row) {
        const el = document.createElement('div');
        el.className = 'vkb-key';
        el.style.flexGrow = String(key.w || 1);
        el.style.flexBasis = '0';
        el.style.setProperty('--finger', this.layout.fingerColors[key.finger] || '#888780');
        const isLetter = /^[a-z]$/.test(key.base);
        const showShift = key.shift && !isLetter && key.shift !== key.base;
        const label = key.label || key.base;
        el.innerHTML =
          `<span class="vkb-shift">${showShift ? escapeHtml(key.shift) : ''}</span>` +
          `<span class="vkb-base">${escapeHtml(label)}</span>`;
        if (this.layout.homeKeys.includes(key.base)) el.classList.add('home');
        rowEl.appendChild(el);
        this.keyEls.push(el);
        this.keyDefs.push(key);
      }
      this.container.appendChild(rowEl);
    }
  }

  clear() {
    for (const el of this.keyEls) el.classList.remove('active');
  }

  setExpected(char) {
    this.clear();
    if (char == null) return;
    const target = this.findKey(char);
    if (!target) return;
    target.el.classList.add('active');
    if (this.needsShift(char, target.key)) {
      const shift = this.shiftFor(target.key);
      if (shift) shift.classList.add('active');
    }
  }

  flash(char) {
    const target = this.findKey(char);
    if (!target) return;
    target.el.classList.add('pressed');
    setTimeout(() => target.el.classList.remove('pressed'), 110);
  }

  flashError(char) {
    const target = this.findKey(char);
    if (!target) return;
    target.el.classList.add('error');
    setTimeout(() => target.el.classList.remove('error'), 380);
  }

  findKey(char) {
    if (char === '\n') return this.byBase('Enter');
    if (char === ' ') return this.byBase(' ');
    let hit = this.byBase(char) || this.byBase(char.toLowerCase());
    if (!hit) {
      const i = this.keyDefs.findIndex((k) => k.shift === char);
      if (i >= 0) hit = { el: this.keyEls[i], key: this.keyDefs[i] };
    }
    return hit;
  }

  byBase(base) {
    const i = this.keyDefs.findIndex((k) => k.base === base);
    return i >= 0 ? { el: this.keyEls[i], key: this.keyDefs[i] } : null;
  }

  needsShift(char, key) {
    if (/[A-Z]/.test(char) && key.base === char.toLowerCase()) return true;
    if (key.shift && key.shift === char && key.shift !== key.base) return true;
    return false;
  }

  shiftFor(key) {
    const side = String(key.finger).startsWith('l') ? 'l' : 'r';
    const i = this.keyDefs.findIndex(
      (k) => k.base === 'Shift' && String(k.finger).startsWith(side)
    );
    return i >= 0 ? this.keyEls[i] : null;
  }
}
