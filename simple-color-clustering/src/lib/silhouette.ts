// 平均シルエット係数。クラスタ数 k の「適切さ」を測る指標として使う。
// O(n^2) なので、呼び出し側で部分集合に絞ってから渡すこと。

function sqDist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

/**
 * 与えられた点とラベルから平均シルエット係数（-1..1）を返す。値が大きいほど良い分割。
 * @param points n × d
 * @param labels 各点のクラスタ index（0..k-1）
 * @param k クラスタ数
 */
export function silhouetteScore(points: number[][], labels: number[], k: number): number {
  const n = points.length;
  if (n === 0 || k < 2) return 0;

  // 各点について、クラスタごとの距離合計を一括計算する。
  let total = 0;
  for (let i = 0; i < n; i++) {
    const sums = new Array<number>(k).fill(0);
    const counts = new Array<number>(k).fill(0);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const c = labels[j];
      sums[c] += Math.sqrt(sqDist(points[i], points[j]));
      counts[c]++;
    }

    const own = labels[i];
    // a(i): 同一クラスタ内の平均距離。単独クラスタなら s=0 とする。
    if (counts[own] === 0) {
      continue; // s(i)=0 を加算
    }
    const a = sums[own] / counts[own];

    // b(i): 他クラスタの平均距離の最小値。
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === own || counts[c] === 0) continue;
      const mean = sums[c] / counts[c];
      if (mean < b) b = mean;
    }
    if (!isFinite(b)) continue; // 他クラスタに点が無い → s=0

    total += (b - a) / Math.max(a, b);
  }

  return total / n;
}
