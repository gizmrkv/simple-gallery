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
