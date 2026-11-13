import { Link } from "react-router-dom";
export function PurchaseSteps({ stage }: { stage: number }) {
  return (
    <ol className="purchase-steps" aria-label="Tahapan pembelian">
      {["Keranjang", "Pengiriman", "Tinjau pesanan", "Pembayaran"].map(
        (label, i) => (
          <li
            key={label}
            className={i <= stage ? "is-active" : ""}
            aria-current={i === stage ? "step" : undefined}
          >
            <span>{i < stage ? "✓" : i + 1}</span>
            {i === 0 && stage < 3 ? (
              <Link to="/keranjang">{label}</Link>
            ) : (
              label
            )}
          </li>
        ),
      )}
    </ol>
  );
}
