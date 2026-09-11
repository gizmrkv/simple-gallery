// 画像のピクセル列 → サンプリング → LAB変換 → 各 k で k-means + シルエット → ベスト k 選択。
import { labToRgb, rgbToHex, rgbToLab, type Rgb } from "./color";
import { kmeans } from "./kmeans";
import { silhouetteScore } from "./silhouette";
import type { ClusterResult, KResult, Swatch } from "./types";

export interface ImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ClusterOptions {
  kMin?: number; // 既定 2
  kMax?: number; // 既定 8
  sampleSize?: number; // k-means に使うサンプル数（既定 3000）
  silhouetteSampleSize?: number; // シルエット計算に使う部分集合（既定 1200）
  alphaThreshold?: number; // これ未満の不透明度のピクセルは無視（既定 16）
  seed?: number; // 再現性のためのシード
}

// mulberry32（kmeans と同等の軽量 PRNG）
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 不透明ピクセルを RGB 配列として収集し、必要なら sampleSize までランダムに間引く。
function samplePixels(image: ImageLike, sampleSize: number, alphaThreshold: number, rng: () => number): Rgb[] {
  const { data } = image;
  const opaque: number[] = []; // ピクセル先頭オフセット
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= alphaThreshold) opaque.push(i);
  }
  if (opaque.length === 0) return [];

  // Fisher-Yates で前方 sampleSize 個を選ぶ。
  const take = Math.min(sampleSize, opaque.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (opaque.length - i));
    const tmp = opaque[i];
    opaque[i] = opaque[j];
    opaque[j] = tmp;
  }

  const result: Rgb[] = [];
  for (let i = 0; i < take; i++) {
    const o = opaque[i];
    result.push([data[o], data[o + 1], data[o + 2]]);
  }
  return result;
}

function buildSwatches(centroids: number[][], sizes: number[]): Swatch[] {
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  return centroids
    .map((c, i) => {
      const lab: [number, number, number] = [c[0], c[1], c[2]];
      const rgb = labToRgb(lab);
      return { lab, rgb, hex: rgbToHex(rgb), weight: sizes[i] / total };
    })
    .sort((a, b) => b.weight - a.weight);
}

export function clusterImage(image: ImageLike, options: ClusterOptions = {}): ClusterResult {
  const {
    kMin = 2,
    kMax = 8,
    sampleSize = 3000,
    silhouetteSampleSize = 1200,
    alphaThreshold = 16,
    seed = 1,
  } = options;

  const rng = makeRng(seed);
  const rgbSamples = samplePixels(image, sampleSize, alphaThreshold, rng);
  if (rgbSamples.length === 0) throw new Error("clusterImage: 不透明なピクセルがありません");

  const points = rgbSamples.map((rgb) => {
    const lab = rgbToLab(rgb);
    return [lab[0], lab[1], lab[2]];
  });

  // シルエット計算用の部分集合（points は既にシャッフル済みなので先頭で十分ランダム）。
  const silN = Math.min(silhouetteSampleSize, points.length);

  const effKMax = Math.min(kMax, points.length);
  const perK: KResult[] = [];
  for (let k = kMin; k <= effKMax; k++) {
    const { centroids, labels, sizes } = kmeans(points, k, { seed });
    const score = silhouetteScore(points.slice(0, silN), labels.slice(0, silN), k);
    perK.push({ k, score, swatches: buildSwatches(centroids, sizes) });
  }

  // フォールバック: 範囲が空（点が極端に少ない）場合は k=1 相当。
  if (perK.length === 0) {
    const { centroids, sizes } = kmeans(points, 1, { seed });
    perK.push({ k: 1, score: 0, swatches: buildSwatches(centroids, sizes) });
  }

  let bestK = perK[0].k;
  let bestScore = perK[0].score;
  for (const r of perK) {
    if (r.score > bestScore) {
      bestScore = r.score;
      bestK = r.k;
    }
  }

  return { bestK, perK };
}
