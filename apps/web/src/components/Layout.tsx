import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { isAdmin, useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useStore } from "../context/StoreContext";
import { InboxBadge } from "../pages/ServicePages";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { QuantityStepper } from "./QuantityStepper";
import { formatRupiah } from "../lib/api";

const links = [
  { to: "/katalog", label: "Koleksi" },
  { to: "/katalog?sort=terbaru", label: "Terbaru" },
  { to: "/#tentang", label: "Tentang kami" },
  { to: "/jurnal", label: "Jurnal" },
  { to: "/bantuan", label: "Bantuan" },
];
export function Layout() {
  const { user } = useAuth();
  const { count, items, subtotal, remove, setQuantity } = useCart();
  const { store } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<"search" | "cart" | "menu" | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    setPanel(null);
    if (!location.hash)
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    else {
      const timer = window.setTimeout(
        () => document.getElementById(location.hash.slice(1))?.scrollIntoView(),
        100,
      );
      return () => window.clearTimeout(timer);
    }
  }, [location.pathname, location.search, location.hash]);
  return (
    <>
      <a className="skip-link" href="#konten">
        Lewati ke konten
      </a>
      <header className="site-header">
        <div className="container header__inner">
          <Link to="/" className="brand" aria-label="Ruang Teduh — beranda">
            ruang teduh
            <span className="brand__mark" aria-hidden="true" />
          </Link>
          <nav className="site-nav" aria-label="Navigasi utama">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={
                  location.pathname + location.search === link.to
                    ? "active"
                    : undefined
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="header__actions">
            <button
              className="header-icon"
              aria-label="Cari produk"
              onClick={() => setPanel("search")}
            >
              <Icon name="search" />
            </button>
            {user ? <InboxBadge /> : null}
            {isAdmin(user) ? (
              <Link
                to="/admin"
                className="header__action header__action--admin"
              >
                Admin
              </Link>
            ) : null}
            <Link
              to={
                user
                  ? "/akun"
                  : `/masuk?next=${encodeURIComponent(location.pathname + location.search)}`
              }
              className="header-icon"
              aria-label={user ? "Akun saya" : "Masuk"}
            >
              <Icon name="user" />
            </Link>
            <button
              className="header-icon header-bag"
              onClick={() => setPanel("cart")}
              aria-label={`Buka keranjang, ${count} item`}
            >
              <Icon name="bag" />
              <span className="cart-count">{count}</span>
            </button>
            <button
              className="header-icon mobile-menu"
              onClick={() => setPanel("menu")}
              aria-label="Buka menu"
            >
              <Icon name="menu" />
            </button>
          </div>
        </div>
        {store?.demoMode ? (
          <div className="demo-bar">
            <div className="container">
              Portfolio demo · Produk dan harga contoh · Tidak memproses
              transaksi nyata
            </div>
          </div>
        ) : null}
      </header>
      <Dialog
        open={panel === "search"}
        onClose={() => setPanel(null)}
        title="Temukan untuk ruangmu"
      >
        <form
          className="collection-search"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/katalog?q=${encodeURIComponent(search.trim())}`);
            setPanel(null);
          }}
        >
          <label htmlFor="site-search">
            Nama produk, material, atau jenis furnitur
          </label>
          <div>
            <input
              id="site-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Coba: kursi, walnut, Serenity…"
            />
            <button className="btn" type="submit">
              Cari
            </button>
          </div>
        </form>
        <p className="muted">Pilihan populer</p>
        <div className="collection-tabs">
          {["Sofa", "Kursi", "Meja", "Karpet"].map((q) => (
            <Link key={q} to={`/katalog?q=${q}`} onClick={() => setPanel(null)}>
              {q}
            </Link>
          ))}
        </div>
      </Dialog>
      <Dialog
        open={panel === "menu"}
        onClose={() => setPanel(null)}
        title="Ruang Teduh"
      >
        <nav className="mobile-nav" aria-label="Menu seluler">
          {links.map((link) => (
            <Link key={link.to} to={link.to} onClick={() => setPanel(null)}>
              {link.label}
              <Icon name="arrow" />
            </Link>
          ))}
        </nav>
      </Dialog>
      <Dialog
        open={panel === "cart"}
        onClose={() => setPanel(null)}
        title={`Keranjangmu (${count})`}
        className="bag-drawer"
      >
        {items.length ? (
          <>
            <ul className="mini-cart">
              {items.map((item) => (
                <li key={item.sku}>
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.imageAlt ?? item.productName}
                      width="120"
                      height="140"
                    />
                  ) : null}
                  <div>
                    <Link
                      to={`/produk/${item.productSlug}`}
                      onClick={() => setPanel(null)}
                    >
                      {item.productName}
                    </Link>
                    <p className="muted">{item.variantLabel}</p>
                    <strong>
                      {formatRupiah(item.unitPrice * item.quantity)}
                    </strong>
                    <div className="mini-cart__actions">
                      <QuantityStepper
                        value={item.quantity}
                        label={item.productName}
                        onChange={(value) => setQuantity(item.sku, value)}
                      />
                      <button
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
            <div className="mini-cart__summary">
              <dl className="totals">
                <div className="totals__grand">
                  <dt>Subtotal</dt>
                  <dd>{formatRupiah(subtotal)}</dd>
                </div>
              </dl>
              <p className="muted">
                Ongkir dihitung setelah alamat pengiriman diisi.
              </p>
              <Link
                className="btn btn--full"
                to="/checkout"
                onClick={() => setPanel(null)}
              >
                Lanjut ke checkout <Icon name="arrow" />
              </Link>
              <Link
                className="btn btn--secondary btn--full"
                to="/keranjang"
                onClick={() => setPanel(null)}
              >
                Lihat keranjang
              </Link>
            </div>
          </>
        ) : (
          <div className="state-block">
            <Icon name="bag" size={36} />
            <h3>Ruang untuk pilihan baru.</h3>
            <p>Keranjangmu masih kosong.</p>
            <Link to="/katalog" className="btn" onClick={() => setPanel(null)}>
              Jelajahi koleksi
            </Link>
          </div>
        )}
      </Dialog>
      <main id="konten" className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer__grid">
          <div className="footer__brand">
            <Link to="/" className="footer__logo">
              ruang teduh.
            </Link>
            <p>
              Furnitur modern, kehangatan yang terasa.
              <br />
              Untuk ruang dan cerita milikmu.
            </p>
            <span className="footer-location">Jakarta, Indonesia · IDR</span>
          </div>
          <div>
            <h2>Koleksi</h2>
            <ul>
              {["Sofa", "Kursi", "Meja", "Tempat tidur"].map((q) => (
                <li key={q}>
                  <Link to={`/katalog?q=${encodeURIComponent(q)}`}>{q}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Ruang untukmu</h2>
            <ul>
              <li>
                <Link to="/akun">Akun & pesanan</Link>
              </li>
              <li>
                <Link to="/akun/bantuan">Layanan pelanggan</Link>
              </li>
              <li>
                <Link to="/bantuan">Pengiriman & kebijakan</Link>
              </li>
              <li>
                <Link to="/jurnal">Jurnal ruang</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>Mari terhubung</h2>
            <p>{store?.contact.email ?? "halo@ruangteduh.example"}</p>
            <p>
              Senin–Jumat
              <br />
              09.00–17.00 WIB
            </p>
            <Link to="/akun/bantuan" className="link-arrow">
              Hubungi tim <Icon name="arrow" size={16} />
            </Link>
          </div>
        </div>
        <div className="container footer__bottom">
          <p>© {new Date().getFullYear()} Ruang Teduh Indonesia.</p>
          <p>
            {store?.demoMode
              ? "Koleksi dan layanan contoh untuk portfolio."
              : "Harga dalam Rupiah. Dimensi dalam sentimeter."}
          </p>
        </div>
      </footer>
    </>
  );
}
