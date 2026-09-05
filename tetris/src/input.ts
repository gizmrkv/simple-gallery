const LEFT_KEYS = new Set(["ArrowLeft", "KeyA"]);
const RIGHT_KEYS = new Set(["ArrowRight", "KeyD"]);
const SOFT_DROP_KEYS = new Set(["ArrowDown", "KeyS"]);
const HARD_DROP_KEYS = new Set(["Space"]);
const ROTATE_CW_KEYS = new Set(["ArrowUp", "KeyX"]);
const ROTATE_CCW_KEYS = new Set(["KeyZ"]);
const HOLD_KEYS = new Set(["ShiftLeft", "ShiftRight", "KeyC"]);

export class InputState {
  private pressed = new Set<string>();
  private hardDropQueued = false;
  private rotateCwQueued = false;
  private rotateCcwQueued = false;
  private holdQueued = false;

  constructor() {
    window.addEventListener("keydown", (e) => {
      const isGameKey =
        LEFT_KEYS.has(e.code) ||
        RIGHT_KEYS.has(e.code) ||
        SOFT_DROP_KEYS.has(e.code) ||
        HARD_DROP_KEYS.has(e.code) ||
        ROTATE_CW_KEYS.has(e.code) ||
        ROTATE_CCW_KEYS.has(e.code) ||
        HOLD_KEYS.has(e.code);
      if (isGameKey) e.preventDefault();
      if (!e.repeat) {
        if (HARD_DROP_KEYS.has(e.code)) this.hardDropQueued = true;
        if (ROTATE_CW_KEYS.has(e.code)) this.rotateCwQueued = true;
        if (ROTATE_CCW_KEYS.has(e.code)) this.rotateCcwQueued = true;
        if (HOLD_KEYS.has(e.code)) this.holdQueued = true;
      }
      this.pressed.add(e.code);
    });
    window.addEventListener("keyup", (e) => {
      this.pressed.delete(e.code);
    });
  }

  getHorizontalHeld(): -1 | 0 | 1 {
    const left = [...LEFT_KEYS].some((k) => this.pressed.has(k));
    const right = [...RIGHT_KEYS].some((k) => this.pressed.has(k));
    if (left === right) return 0;
    return left ? -1 : 1;
  }

  isSoftDropHeld(): boolean {
    return [...SOFT_DROP_KEYS].some((k) => this.pressed.has(k));
  }

  // 押した瞬間に1回だけtrueを返す(呼び出すたびに消費される)
  consumeHardDropPress(): boolean {
    if (this.hardDropQueued) {
      this.hardDropQueued = false;
      return true;
    }
    return false;
  }

  consumeRotateCw(): boolean {
    if (this.rotateCwQueued) {
      this.rotateCwQueued = false;
      return true;
    }
    return false;
  }

  consumeRotateCcw(): boolean {
    if (this.rotateCcwQueued) {
      this.rotateCcwQueued = false;
      return true;
    }
    return false;
  }

  consumeHold(): boolean {
    if (this.holdQueued) {
      this.holdQueued = false;
      return true;
    }
    return false;
  }
}
