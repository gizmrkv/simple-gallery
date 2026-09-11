import type { Lab, Rgb } from "./color";

// 1色（クラスタ重心 = テーマカラー）の表現。
export interface Swatch {
  rgb: Rgb;
  hex: string;
  lab: Lab;
  weight: number; // そのクラスタが占める割合（0-1）
}

// あるクラスタ数 k についての結果。
export interface KResult {
  k: number;
  score: number; // 平均シルエット係数
  swatches: Swatch[]; // weight 降順
}

// 1枚の画像に対するクラスタリング結果。手動で k を切り替えられるよう全 k を保持。
export interface ClusterResult {
  bestK: number;
  perK: KResult[];
}

// localStorage に保存する1件の履歴。再表示に必要な情報を含む。
export interface HistoryItem {
  id: string;
  thumbDataURL: string; // 一覧表示用の小サムネイル
  previewDataURL: string; // 再表示用の画像
  result: ClusterResult; // 全 k の結果（再計算不要）
  createdAt: number; // epoch ms
}
