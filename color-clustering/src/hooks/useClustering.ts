// Web Worker を1つ保持し、画像のクラスタリングを Promise で呼び出せるようにする hook。
import { useCallback, useEffect, useRef } from "react";
import type { ImageLike, ClusterOptions } from "../lib/clusterImage";
import type { ClusterResult } from "../lib/types";
import type { ClusterRequest, ClusterResponse } from "../worker/cluster.worker";

export function useClustering() {
  const workerRef = useRef<Worker | null>(null);
  const seqRef = useRef(0);
  const pending = useRef(new Map<number, { resolve: (r: ClusterResult) => void; reject: (e: Error) => void }>());

  useEffect(() => {
    const worker = new Worker(new URL("../worker/cluster.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<ClusterResponse>) => {
      const msg = e.data;
      const entry = pending.current.get(msg.id);
      if (!entry) return;
      pending.current.delete(msg.id);
      if (msg.ok) entry.resolve(msg.result);
      else entry.reject(new Error(msg.error));
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      pending.current.clear();
    };
  }, []);

  const cluster = useCallback((image: ImageLike, options?: ClusterOptions): Promise<ClusterResult> => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("worker が初期化されていません"));
    const id = ++seqRef.current;
    return new Promise<ClusterResult>((resolve, reject) => {
      pending.current.set(id, { resolve, reject });
      worker.postMessage({ id, image, options } satisfies ClusterRequest);
    });
  }, []);

  return { cluster };
}
