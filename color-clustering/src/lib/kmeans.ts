// k-means++ 初期化 + Lloyd 反復。点は任意次元の number[][]（本アプリでは LAB の3次元）。
// 再現性のためシード付き PRNG を使う。

export interface KMeansResult {
  centroids: number[][]; // k × d
  labels: number[]; // 各点が属するクラスタ index（長さ n）
  sizes: number[]; // 各クラスタの点数（長さ k）
  inertia: number; // 割り当て先重心までの二乗距離の総和
}

export interface KMeansOptions {
  maxIter?: number; // Lloyd 反復の上限
  restarts?: number; // 初期化を変えて試す回数（inertia 最小を採用）
  tol?: number; // 重心移動がこの値未満で収束とみなす
  seed?: number; // PRNG シード
}

// mulberry32: 軽量で再現性のある PRNG。
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sqDist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

// k-means++ で初期重心を選ぶ。
function initPlusPlus(points: number[][], k: number, rng: () => number): number[][] {
  const n = points.length;
  const centroids: number[][] = [points[Math.floor(rng() * n)].slice()];
  const minSq = new Array<number>(n).fill(Infinity);

  while (centroids.length < k) {
    const last = centroids[centroids.length - 1];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const d = sqDist(points[i], last);
      if (d < minSq[i]) minSq[i] = d;
      total += minSq[i];
    }
    // D(x)^2 に比例した確率で次の重心を選ぶ。
    let target = rng() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      target -= minSq[i];
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push(points[chosen].slice());
  }
  return centroids;
}

function runOnce(points: number[][], k: number, maxIter: number, tol: number, rng: () => number): KMeansResult {
  const n = points.length;
  const dim = points[0].length;
  let centroids = initPlusPlus(points, k, rng);
  const labels = new Array<number>(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // 割り当てステップ
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = sqDist(points[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      labels[i] = best;
    }

    // 更新ステップ（重心 = 各クラスタの平均）
    const sums = Array.from({ length: k }, () => new Array<number>(dim).fill(0));
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      counts[c]++;
      const p = points[i];
      const s = sums[c];
      for (let d = 0; d < dim; d++) s[d] += p[d];
    }

    const next: number[][] = [];
    let maxShift = 0;
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        // 空クラスタは「最も近い重心から最も遠い点」で再初期化する。
        let far = 0;
        let farD = -1;
        for (let i = 0; i < n; i++) {
          const d = sqDist(points[i], centroids[labels[i]]);
          if (d > farD) {
            farD = d;
            far = i;
          }
        }
        next.push(points[far].slice());
        maxShift = Infinity; // 再初期化したので必ずもう1反復する
      } else {
        const c0 = centroids[c];
        const m = sums[c].map((v) => v / counts[c]);
        maxShift = Math.max(maxShift, sqDist(c0, m));
        next.push(m);
      }
    }
    centroids = next;
    if (maxShift <= tol * tol) break;
  }

  // 最終ラベルとサイズ・inertia を確定。
  const sizes = new Array<number>(k).fill(0);
  let inertia = 0;
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < k; c++) {
      const d = sqDist(points[i], centroids[c]);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    labels[i] = best;
    sizes[best]++;
    inertia += bestD;
  }

  return { centroids, labels, sizes, inertia };
}

export function kmeans(points: number[][], k: number, options: KMeansOptions = {}): KMeansResult {
  const { maxIter = 50, restarts = 4, tol = 1e-4, seed = 1 } = options;
  if (points.length === 0) throw new Error("kmeans: points is empty");
  if (k < 1) throw new Error("kmeans: k must be >= 1");
  const effectiveK = Math.min(k, points.length);

  const rng = makeRng(seed);
  let best: KMeansResult | null = null;
  for (let r = 0; r < restarts; r++) {
    const result = runOnce(points, effectiveK, maxIter, tol, rng);
    if (best === null || result.inertia < best.inertia) best = result;
  }
  return best!;
}
