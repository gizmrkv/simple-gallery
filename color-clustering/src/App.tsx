import { useCallback, useEffect, useRef, useState } from "react";
import { Dropzone } from "./components/Dropzone";
import { HistoryPanel } from "./components/HistoryPanel";
import { ResultView } from "./components/ResultView";
import { useClustering } from "./hooks/useClustering";
import { useHistory } from "./hooks/useHistory";
import { prepareImageFromFile, prepareImageFromSrc } from "./lib/loadImage";
import type { ClusterResult, HistoryItem } from "./lib/types";

const SAMPLE_URL = `${import.meta.env.BASE_URL}sample.svg`;

type Status = "idle" | "working" | "ready" | "error";

export default function App() {
  const { cluster } = useClustering();
  const history = useHistory();
  const [status, setStatus] = useState<Status>("working");
  const sampleLoaded = useRef(false);
  const [error, setError] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [result, setResult] = useState<ClusterResult | null>(null);
  const [selectedK, setSelectedK] = useState<number>(0);
  const [toast, setToast] = useState<string>("");
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1600);
  }, []);

  const copyHex = useCallback(
    (hex: string) => {
      navigator.clipboard?.writeText(hex).then(
        () => showToast(`${hex.toUpperCase()} をコピーしました`),
        () => showToast("コピーできませんでした"),
      );
    },
    [showToast],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setStatus("working");
      setError("");
      try {
        const prepared = await prepareImageFromFile(file);
        const res = await cluster(prepared.imageData);
        setPreviewUrl(prepared.previewDataURL);
        setResult(res);
        setSelectedK(res.bestK);
        setStatus("ready");
        history.add({ thumbDataURL: prepared.thumbDataURL, previewDataURL: prepared.previewDataURL, result: res });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    },
    [cluster, history],
  );

  const selectHistory = useCallback((item: HistoryItem) => {
    setPreviewUrl(item.previewDataURL);
    setResult(item.result);
    setSelectedK(item.result.bestK);
    setStatus("ready");
    setError("");
  }, []);

  // 初回表示: サンプル画像を解析して結果を出す（履歴には追加しない）。
  useEffect(() => {
    if (sampleLoaded.current) return;
    sampleLoaded.current = true;
    (async () => {
      try {
        const prepared = await prepareImageFromSrc(SAMPLE_URL);
        const res = await cluster(prepared.imageData);
        setPreviewUrl(prepared.previewDataURL);
        setResult(res);
        setSelectedK(res.bestK);
        setStatus("ready");
      } catch {
        setStatus("idle"); // サンプル失敗時は静かにドロップゾーンのみ表示
      }
    })();
  }, [cluster]);

  const working = status === "working";

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Theme Color</h1>
        <p className="app__subtitle">
          画像の色を3次元ベクトルとしてクラスタリングし、主要なテーマカラーを抽出します。
        </p>
      </header>

      <section className="app__main">
        <Dropzone onFile={handleFile} disabled={working} compact={status === "ready"} />

        {working && (
          <div className="status status--working">
            <span className="spinner" aria-hidden="true" />
            色を解析しています…
          </div>
        )}
        {status === "error" && <div className="status status--error">{error}</div>}

        {result && previewUrl && (
          <ResultView
            previewUrl={previewUrl}
            result={result}
            selectedK={selectedK}
            onSelectK={setSelectedK}
            onCopy={copyHex}
          />
        )}
      </section>

      <HistoryPanel items={history.items} onSelect={selectHistory} onRemove={history.remove} />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
