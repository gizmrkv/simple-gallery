import { encode, type Vocab } from './tokenize';
import { softmax, type Predictor } from './inference';

// leave-one-out occlusion: 各文字位置を未知文字トークンに置き換えて再推論し、
// 対象クラスの確率がどれだけ下がるかをその文字の寄与度とする
// (勾配を使わずforward推論だけで求まる、SHAP的な特徴帰属の簡易版)。
// 戻り値は各文字位置ごとの寄与度(単語全体での確率からの低下量)。
export async function computeAttribution(
  word: string,
  vocab: Vocab,
  predictor: Predictor,
  targetLabelIndex: number,
): Promise<number[]> {
  const trimmed = word.trim();
  const baseIds = encode(trimmed, vocab);
  const baseLogits = await predictor.predictLogits(baseIds, vocab.max_len);
  const baseProb = softmax(baseLogits)[targetLabelIndex];

  const scores: number[] = [];
  const length = Math.min(trimmed.length, vocab.max_len);
  for (let i = 0; i < length; i++) {
    const maskedIds = baseIds.slice();
    maskedIds[i] = BigInt(vocab.unk_char_id);
    const logits = await predictor.predictLogits(maskedIds, vocab.max_len);
    const prob = softmax(logits)[targetLabelIndex];
    scores.push(baseProb - prob);
  }
  return scores;
}

export interface WindowScore {
  start: number;
  length: number;
  score: number;
}

// 「この部分がその言語らしい理由」機能用: 1文字ずつではなく2〜4文字の窓(連続した
// 部分文字列)ごとに同じocclusion手法でスコアを求める。単語全体の窓を一度にまとめて
// 計算しておくことで、自動表示(全体最高スコアの窓)とクリック探索(クリックした
// 文字を含む窓の中で最高スコアのもの)の両方を、追加の推論なしで実現できる。
export async function computeWindowScores(
  word: string,
  vocab: Vocab,
  predictor: Predictor,
  targetLabelIndex: number,
  windowSizes: number[] = [2, 3, 4],
): Promise<WindowScore[]> {
  const trimmed = word.trim();
  const length = Math.min(trimmed.length, vocab.max_len);
  const baseIds = encode(trimmed, vocab);
  const baseLogits = await predictor.predictLogits(baseIds, vocab.max_len);
  const baseProb = softmax(baseLogits)[targetLabelIndex];

  const windows: WindowScore[] = [];
  for (const size of windowSizes) {
    if (size > length) continue;
    for (let start = 0; start <= length - size; start++) {
      const maskedIds = baseIds.slice();
      for (let i = start; i < start + size; i++) {
        maskedIds[i] = BigInt(vocab.unk_char_id);
      }
      const logits = await predictor.predictLogits(maskedIds, vocab.max_len);
      const prob = softmax(logits)[targetLabelIndex];
      windows.push({ start, length: size, score: baseProb - prob });
    }
  }
  return windows;
}

// 全窓の中で最もスコアが高いものを返す(自動表示用)。
export function bestWindow(windows: WindowScore[]): WindowScore | null {
  if (windows.length === 0) return null;
  return windows.reduce((best, w) => (w.score > best.score ? w : best));
}

// 指定した文字位置を含む窓の中で最もスコアが高いものを返す(クリック探索用)。
export function bestWindowAt(windows: WindowScore[], charIndex: number): WindowScore | null {
  const containing = windows.filter(
    (w) => charIndex >= w.start && charIndex < w.start + w.length,
  );
  return bestWindow(containing);
}
