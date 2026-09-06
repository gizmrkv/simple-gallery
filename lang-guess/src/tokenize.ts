export interface Vocab {
  char_to_id: Record<string, number>;
  pad_id: number;
  unk_char_id: number;
  max_len: number;
  labels: string[];
}

export async function loadVocab(url: string): Promise<Vocab> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`vocab.jsonの読み込みに失敗しました (status: ${res.status})`);
  }
  return (await res.json()) as Vocab;
}

// 学習時と同じ規則(小文字化・固定長パディング/切り詰め・未知文字はunk_char_id)で
// 単語を文字IDの固定長配列にエンコードする。ONNX Runtime Webへの入力はint64テンソル
// なのでBigInt64Arrayを返す。
export function encode(word: string, vocab: Vocab): BigInt64Array {
  const chars = word.toLowerCase().trim().split('');
  const ids = new BigInt64Array(vocab.max_len);
  for (let i = 0; i < vocab.max_len; i++) {
    if (i < chars.length) {
      const id = vocab.char_to_id[chars[i]] ?? vocab.unk_char_id;
      ids[i] = BigInt(id);
    } else {
      ids[i] = BigInt(vocab.pad_id);
    }
  }
  return ids;
}
