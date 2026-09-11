import type { ClusterResult } from "../lib/types";
import { KControl } from "./KControl";
import { PaletteSwatches } from "./PaletteSwatches";

interface Props {
  previewUrl: string;
  result: ClusterResult;
  selectedK: number;
  onSelectK: (k: number) => void;
  onCopy: (hex: string) => void;
}

export function ResultView({ previewUrl, result, selectedK, onSelectK, onCopy }: Props) {
  const kValues = result.perK.map((r) => r.k);
  const current = result.perK.find((r) => r.k === selectedK) ?? result.perK[0];

  return (
    <div className="result">
      <div className="result__image">
        <img src={previewUrl} alt="アップロードした画像" />
      </div>
      <div className="result__panel">
        <KControl kValues={kValues} bestK={result.bestK} value={current.k} onChange={onSelectK} />
        <PaletteSwatches swatches={current.swatches} onCopy={onCopy} />
      </div>
    </div>
  );
}
