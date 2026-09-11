import type { HistoryItem } from "../lib/types";

interface Props {
  items: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onRemove: (id: string) => void;
}

export function HistoryPanel({ items, onSelect, onRemove }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="history">
      <h2 className="history__title">これまでの結果</h2>
      <div className="history__grid">
        {items.map((item) => {
          const swatches = item.result.perK.find((r) => r.k === item.result.bestK)?.swatches ?? [];
          return (
            <div key={item.id} className="hcard" onClick={() => onSelect(item)} role="button" tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(item);
              }}
            >
              <button
                className="hcard__del"
                title="削除"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.id);
                }}
              >
                ×
              </button>
              <img className="hcard__thumb" src={item.thumbDataURL} alt="過去の画像" />
              <div className="hcard__palette">
                {swatches.map((s) => (
                  <span key={s.hex + s.weight} style={{ background: s.hex }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
