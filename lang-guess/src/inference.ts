// グローバル読み込みしたortを使う(Vite ESM/WASM解決問題の回避、mnist-doodleと同じ方法)
const ort = (window as any).ort;

export class Predictor {
  private session: any = null;
  // index.htmlからの相対パス(GitHub Pagesのサブパスでも動くように)
  private readonly modelUrl = './model/lang-id.onnx';

  async init() {
    if (!ort) {
      throw new Error('ONNX Runtime not loaded. Check index.html script tag.');
    }
    ort.env.wasm.wasmPaths = './';
    ort.env.wasm.numThreads = 1;
    this.session = await ort.InferenceSession.create(this.modelUrl);
  }

  // 文字IDテンソル(shape [1, max_len])を入力し、生のlogits(shape [1, num_classes])を返す。
  async predictLogits(ids: BigInt64Array, maxLen: number): Promise<Float32Array> {
    if (!this.session) {
      throw new Error('Predictor not initialized');
    }
    const tensor = new ort.Tensor('int64', ids, [1, maxLen]);
    const results = await this.session.run({ input: tensor });
    return results.logits.data as Float32Array;
  }
}

export function softmax(logits: ArrayLike<number>): number[] {
  const values = Array.from(logits);
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}
