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
      canvas.setPointerCapture(e.pointerId);
      this.paint(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.enabled && this.painting) this.paint(e);
    });
    const stop = (e: PointerEvent) => {
      if (!this.painting) return;
      this.painting = false;
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
    if (cell < 0 || this.buffer[cell] === this.paintValue) return;
    this.buffer[cell] = this.paintValue;
    this.onChanged();
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
