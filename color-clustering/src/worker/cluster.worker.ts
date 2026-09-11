// クラスタリング計算を別スレッドで実行し UI のブロックを防ぐ。
import { clusterImage, type ClusterOptions, type ImageLike } from "../lib/clusterImage";
import type { ClusterResult } from "../lib/types";

export interface ClusterRequest {
  id: number;
  image: ImageLike;
  options?: ClusterOptions;
}

export type ClusterResponse =
  | { id: number; ok: true; result: ClusterResult }
  | { id: number; ok: false; error: string };

self.onmessage = (e: MessageEvent<ClusterRequest>) => {
  const { id, image, options } = e.data;
  try {
    const result: ClusterResult = clusterImage(image, options);
    self.postMessage({ id, ok: true, result } satisfies ClusterResponse);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies ClusterResponse);
  }
};
