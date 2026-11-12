export function QuantityStepper({
  value,
  onChange,
  label,
  max = 99,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  max?: number;
}) {
  return (
    <div className="quantity" role="group" aria-label={`Kuantitas ${label}`}>
      <button
        type="button"
        className="quantity__btn"
        onClick={() => onChange(Math.max(1, value - 1))}
        aria-label={`Kurangi kuantitas ${label}`}
        disabled={value <= 1}
      >
        −
      </button>
      <input
        className="quantity__input"
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        aria-label={`Kuantitas ${label}`}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(1, next)));
        }}
      />
      <button
        type="button"
        className="quantity__btn"
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label={`Tambah kuantitas ${label}`}
        disabled={value >= max}
      >
        +
      </button>
    </div>
  );
}
