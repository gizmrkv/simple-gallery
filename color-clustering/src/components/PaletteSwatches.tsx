import type { Swatch } from "../lib/types";

interface Props {
  swatches: Swatch[];
  onCopy: (hex: string) => void;
}

// 相対輝度から、スウォッチ上の文字色（黒/白）を選ぶ。
function readableText(rgb: readonly [number, number, number]): string {
  const [r, g, b] = rgb.map((c) => c / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? "#1a1a1f" : "#ffffff";
}

export function PaletteSwatches({ swatches, onCopy }: Props) {
  return (
    <div className="swatches">
      {swatches.map((s) => (
        <button
          key={s.hex + s.weight}
          className="swatch"
          style={{ background: s.hex, color: readableText(s.rgb) }}
          onClick={() => onCopy(s.hex)}
          title="クリックで HEX をコピー"
        >
          <span className="swatch__pct">{(s.weight * 100).toFixed(1)}%</span>
          <span className="swatch__hex">{s.hex.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}
