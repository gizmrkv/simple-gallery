import type { Vec2 } from './vec2';
import { normalize, zero } from './vec2';

const DIRECTION_KEYS: Record<string, Vec2> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

export class InputState {
  private pressed = new Set<string>();
  private toggleHandlers: (() => void)[] = [];

  constructor() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  onModeToggle(handler: () => void): void {
    this.toggleHandlers.push(handler);
  }

  getDirection(): Vec2 {
    let dir = zero();
    for (const key of this.pressed) {
      const d = DIRECTION_KEYS[key];
      if (d) dir = { x: dir.x + d.x, y: dir.y + d.y };
    }
    return normalize(dir);
  }

  private onKeyDown(e: KeyboardEvent): void {
    const key = DIRECTION_KEYS[e.key] ? e.key : e.key.toLowerCase();
    if (DIRECTION_KEYS[key]) this.pressed.add(key);
    if (key === 'm') this.toggleHandlers.forEach((h) => h());
  }

  private onKeyUp(e: KeyboardEvent): void {
    const key = DIRECTION_KEYS[e.key] ? e.key : e.key.toLowerCase();
    this.pressed.delete(key);
  }
}
