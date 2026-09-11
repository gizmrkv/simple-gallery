interface Props {
  kValues: number[]; // 選択可能な k（昇順）
  bestK: number; // 自動選択された k
  value: number; // 現在の k
  onChange: (k: number) => void;
}

export function KControl({ kValues, bestK, value, onChange }: Props) {
  const min = kValues[0];
  const max = kValues[kValues.length - 1];

  return (
    <div className="kcontrol">
      <div className="kcontrol__head">
        <span className="kcontrol__label">クラス数</span>
        <span className="kcontrol__value">
          {value}
          {value === bestK && <span className="kcontrol__auto">自動</span>}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="クラス数"
      />
      <div className="kcontrol__foot">
        <span>
          適切なクラス数: <strong>{bestK}</strong>
        </span>
        {value !== bestK && (
          <button className="kcontrol__reset" onClick={() => onChange(bestK)}>
            自動に戻す
          </button>
        )}
      </div>
    </div>
  );
}
