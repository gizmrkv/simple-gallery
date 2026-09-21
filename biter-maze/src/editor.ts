// detail canvas をそのまま編集面として使う自作迷路エディタ。
// ポインタ塗りは turing-pattern/src/main.ts のパターンを踏襲。
import type { DetailRenderer } from "./render.ts";

export class MazeEditor {
  buffer: Uint8Array;
  private detail: DetailRenderer;
  private onChanged: () => void;
  private painting = false;
  private paintValue = 1;
  private enabled = false;
  /** 直前に塗ったセル。ポインタイベントの間を補間するために持つ。 */
  private lastCell = -1;

  constructor(canvas: HTMLCanvasElement, detail: DetailRenderer, w: number, h: number, onChanged: () => void) {
    this.detail = detail;
    this.buffer = new Uint8Array(w * h);
    this.onChanged = onChanged;

    canvas.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      // 右ボタン or Shift で消去。
      this.paintValue = e.button === 2 || e.shiftKey ? 0 : 1;
      this.painting = true;
      this.lastCell = -1;
      canvas.setPointerCapture(e.pointerId);
      this.paint(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.enabled && this.painting) this.paint(e);
    });
    const stop = (e: PointerEvent) => {
      if (!this.painting) return;
      this.painting = false;
      this.lastCell = -1;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.addEventListener("contextmenu", (e) => {
      if (this.enabled) e.preventDefault();
    });
  }

  private paint(e: PointerEvent): void {
    const cell = this.detail.cellAt(e.clientX, e.clientY);
    if (cell < 0) return;
    // ポインタを速く動かすとイベントが飛び飛びになるので、直前のセルとの間を
    // 補間して塗る。これが無いと線を引いたつもりが点線になる。
    const changed =
      this.lastCell >= 0 && this.lastCell !== cell
        ? this.strokeLine(this.lastCell, cell)
        : this.setCell(cell);
    this.lastCell = cell;
    if (changed) this.onChanged();
  }

  private setCell(cell: number): boolean {
    if (this.buffer[cell] === this.paintValue) return false;
    this.buffer[cell] = this.paintValue;
    return true;
  }

  /** 2セル間を直線で塗る（DDA）。 */
  private strokeLine(from: number, to: number): boolean {
    const w = this.detail.width;
    if (w <= 0) return this.setCell(to);
    const x0 = from % w;
    const y0 = (from / w) | 0;
    const x1 = to % w;
    const y1 = (to / w) | 0;
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    let changed = false;
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      if (this.setCell(y * w + x)) changed = true;
    }
    return changed;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    this.painting = false;
  }

  resize(w: number, h: number): void {
    this.buffer = new Uint8Array(w * h);
  }

  clear(): void {
    this.buffer.fill(0);
    this.onChanged();
  }

  copyFrom(walls: Uint8Array): void {
    this.buffer.set(walls.subarray(0, this.buffer.length));
    this.onChanged();
  }
}
