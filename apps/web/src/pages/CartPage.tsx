import { Link } from 'react-router-dom';
import { QuantityStepper } from '../components/QuantityStepper';
import { PurchaseSteps } from '../components/PurchaseSteps';
import { Seo } from '../components/Seo';
import { useCart } from '../context/CartContext';
import { formatRupiah } from '../lib/api';

export function CartPage() {
  const { items, setQuantity, remove, subtotal } = useCart();

  return (
    <>
      <Seo title="Keranjang — Ruang Teduh" description="Periksa isi keranjang sebelum checkout." noIndex />
      <div className="container page">
        <PurchaseSteps stage={0} />
        <header className="page-head">
          <p className="eyebrow">Sebelum checkout</p>
          <h1>Keranjang</h1>
          <p className="page-head__lead">
            Satu langkah lebih dekat dengan ruang impianmu. Periksa pilihanmu sebelum melanjutkan.
          </p>
        </header>

        {items.length === 0 ? (
          <div className="state-block">
            <p className="eyebrow">Keranjang kosong</p>
            <h2>Belum ada produk yang dipilih.</h2>
            <p>Temukan sofa, kursi, dan detail yang membuat rumah terasa lebih hangat.</p>
            <div className="hero__actions">
              <Link to="/katalog" className="btn">
                Jelajahi koleksi
              </Link>
              <Link to="/katalog" className="link-arrow">
                Semua produk <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="cart-layout">
            <section aria-labelledby="isi-keranjang">
              <h2 id="isi-keranjang" className="sr-only">
                Isi keranjang
              </h2>
              <ul className="cart-list">
                {items.map((item) => (
                  <li className="cart-item" key={item.sku}>
                    <div className="cart-item__media">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.imageAlt ?? item.productName}
                          width={800}
                          height={600}
                          loading="lazy"
                        />
                      ) : (
                        <div className="product-card__placeholder" aria-hidden="true" />
                      )}
                    </div>
                    <div className="cart-item__body">
                      <div className="cart-item__head">
                        <div>
                          <p className="product-card__category">{item.category}</p>
                          <h3>
                            <Link to={`/produk/${item.productSlug}`}>{item.productName}</Link>
                          </h3>
                          <p className="muted">{item.variantLabel}</p>
                          <p className="cart-item__sku">SKU {item.sku}</p>
                        </div>
                        <p className="cart-item__price">{formatRupiah(item.unitPrice)}</p>
                      </div>
                      <div className="cart-item__actions">
                        <QuantityStepper
                          value={item.quantity}
                          label={`${item.productName} ${item.variantLabel}`}
                          onChange={(value) => setQuantity(item.sku, value)}
                        />
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => remove(item.sku)}
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <aside className="cart-summary" aria-label="Ringkasan keranjang">
              <h2>Ringkasan</h2>
              <dl className="totals">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{formatRupiah(subtotal)}</dd>
                </div>
                <div>
                  <dt>Ongkir</dt>
                  <dd>Dihitung di checkout</dd>
                </div>
                <div className="totals__grand">
                  <dt>Total sementara</dt>
                  <dd>{formatRupiah(subtotal)}</dd>
                </div>
              </dl>
              <p className="muted">
                Harga, stok, dan ongkir final dihitung ulang oleh server sebelum pembayaran.
              </p>
              <Link to="/checkout" className="btn btn--full">
                Lanjut ke checkout
              </Link>
              <Link to="/katalog" className="link-arrow link-arrow--center">
                Lanjut belanja
              </Link>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
