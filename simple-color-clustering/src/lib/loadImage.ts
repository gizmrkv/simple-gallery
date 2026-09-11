// File / 画像要素 → クラスタリング用に縮小した ImageData と、表示・履歴用の dataURL を生成する。
import type { ImageLike } from "./clusterImage";

export interface PreparedImage {
  imageData: ImageLike; // クラスタリング用（最大辺を抑えた縮小版）
  previewDataURL: string; // 結果画面に表示する中サイズ画像
  thumbDataURL: string; // 履歴用の小サイズサムネイル
  width: number; // 元画像の寸法
  height: number;
}

const CLUSTER_MAX_EDGE = 160;
const PREVIEW_MAX_EDGE = 640;
const THUMB_MAX_EDGE = 120;

function scaledSize(w: number, h: number, maxEdge: number): [number, number] {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
}

function drawTo(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d コンテキストを取得できませんでした");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function loadHTMLImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を読み込めませんでした"));
    img.src = src;
  });
}

export async function prepareImageFromFile(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選択してください");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    return await prepareImageFromSrc(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareImageFromSrc(src: string): Promise<PreparedImage> {
  const img = await loadHTMLImage(src);
  const { naturalWidth: w, naturalHeight: h } = img;

  const [cw, ch] = scaledSize(w, h, CLUSTER_MAX_EDGE);
  const clusterCanvas = drawTo(img, cw, ch);
  const ctx = clusterCanvas.getContext("2d")!;
  const id = ctx.getImageData(0, 0, cw, ch);

  const [pw, ph] = scaledSize(w, h, PREVIEW_MAX_EDGE);
  const previewDataURL = drawTo(img, pw, ph).toDataURL("image/jpeg", 0.85);

  const [tw, th] = scaledSize(w, h, THUMB_MAX_EDGE);
  const thumbDataURL = drawTo(img, tw, th).toDataURL("image/jpeg", 0.7);

  return {
    imageData: { data: id.data, width: id.width, height: id.height },
    previewDataURL,
    thumbDataURL,
    width: w,
    height: h,
  };
}
