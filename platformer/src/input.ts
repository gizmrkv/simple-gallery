const LEFT_KEYS = new Set(["ArrowLeft", "KeyA"]);
const RIGHT_KEYS = new Set(["ArrowRight", "KeyD"]);
const JUMP_KEYS = new Set(["ArrowUp", "KeyW", "Space"]);

export class InputState {
  private pressed = new Set<string>();
  private jumpQueued = false;

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (JUMP_KEYS.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) this.jumpQueued = true;
      }
      this.pressed.add(e.code);
    });
    window.addEventListener("keyup", (e) => {
      this.pressed.delete(e.code);
    });
  }

  getMoveDir(): -1 | 0 | 1 {
    const left = [...LEFT_KEYS].some((k) => this.pressed.has(k));
    const right = [...RIGHT_KEYS].some((k) => this.pressed.has(k));
    if (left === right) return 0;
    return left ? -1 : 1;
  }

  // 押した瞬間に1回だけtrueを返す(呼び出すたびに消費される)。
  // ホールドしたままにすると着地の瞬間ごとに即再ジャンプしてしまい、
  // 大ジャンプが連鎖して足場を飛び越え続け、ギャップを渡れなくなるため。
  consumeJumpPress(): boolean {
    if (this.jumpQueued) {
      this.jumpQueued = false;
      return true;
    }
    return false;
  }
}
