// ノイズ場をLUT経由でcanvasに描画する。フィールドは低解像度(resolution x resolution)の
// オフスクリーンcanvasに書き込み、それを表示用canvasへ拡大描画する。
// 表示用canvasは常に正方形として扱う(サイズ管理はmain.ts側のResizeObserverが行う)ので、
// letterbox(余白)はフレックスレイアウトによる中央寄せで自然に表現される。

import { fractalNoise, type FractalParams } from "./noise/fractal.ts";

export interface FieldParams extends FractalParams {
  resolution: number;
  t: number;
}

export class NoiseRenderer {
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

  render(params: FieldParams, lut: Uint8ClampedArray): void {
    const res = params.resolution;
    this.ensureOffscreen(res);
    const data = this.imageData!.data;

    let o = 0;
    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        const v = fractalNoise(px, py, params.t, params);
        let idx = ((v * 0.5 + 0.5) * 255) | 0;
        if (idx < 0) idx = 0;
        else if (idx > 255) idx = 255;
        const lo = idx * 3;
        data[o] = lut[lo];
        data[o + 1] = lut[lo + 1];
        data[o + 2] = lut[lo + 2];
        data[o + 3] = 255;
        o += 4;
      }
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
