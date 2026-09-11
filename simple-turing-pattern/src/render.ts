// v場をLUT経由でcanvasに描画する。シミュレーションは低解像度(resolution x resolution)の
// オフスクリーンcanvasに書き込み、それを表示用canvasへ拡大描画する。
// 表示用canvasは常に正方形として扱う(サイズ管理はmain.ts側のResizeObserverが行う)ので、
// letterbox(余白)はフレックスレイアウトによる中央寄せで自然に表現される。

import type { GrayScott } from "./simulation";

export const DISPLAY_GAIN = 2.5;

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private imageData: ImageData | null = null;
  private offRes = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context not available");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = true;

    this.offscreen = document.createElement("canvas");
    const offCtx = this.offscreen.getContext("2d");
    if (!offCtx) throw new Error("2D context not available");
    this.offCtx = offCtx;
  }

  private ensureOffscreen(resolution: number): void {
    if (this.offRes !== resolution) {
      this.offRes = resolution;
      this.offscreen.width = resolution;
      this.offscreen.height = resolution;
      this.imageData = this.offCtx.createImageData(resolution, resolution);
    }
  }

  // 表示用canvasのピクセルバッファを、指定したCSSピクセルサイズ(正方形)に合わせる。
  resizeTo(cssSize: number): void {
    const dpr = window.devicePixelRatio || 1;
    const pixelSize = Math.max(1, Math.round(cssSize * dpr));
    if (this.canvas.width !== pixelSize || this.canvas.height !== pixelSize) {
      this.canvas.width = pixelSize;
      this.canvas.height = pixelSize;
      this.ctx.imageSmoothingEnabled = true;
    }
  }

  render(sim: GrayScott, lut: Uint8ClampedArray): void {
    const res = sim.resolution;
    this.ensureOffscreen(res);
    const data = this.imageData!.data;
    const v = sim.v;
    const n = res * res;

    for (let i = 0; i < n; i++) {
      let idx = (v[i] * 255 * DISPLAY_GAIN) | 0;
      if (idx < 0) idx = 0;
      else if (idx > 255) idx = 255;
      const lo = idx * 3;
      const o = i * 4;
      data[o] = lut[lo];
      data[o + 1] = lut[lo + 1];
      data[o + 2] = lut[lo + 2];
      data[o + 3] = 255;
    }
    this.offCtx.putImageData(this.imageData!, 0, 0);

    this.ctx.drawImage(
      this.offscreen,
      0,
      0,
      res,
      res,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
  }
}

// ポインタのcanvas要素内座標(CSSピクセル)をグリッド座標に変換する。
// canvasは常に正方形で表示されるため、クライアント矩形に対する比率をそのまま
// グリッド解像度に掛けるだけでよい。
export function pointerToGrid(
  offsetX: number,
  offsetY: number,
  canvas: HTMLCanvasElement,
  resolution: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const gx = Math.floor((offsetX / rect.width) * resolution);
  const gy = Math.floor((offsetY / rect.height) * resolution);
  return {
    x: Math.min(resolution - 1, Math.max(0, gx)),
    y: Math.min(resolution - 1, Math.max(0, gy)),
  };
}
