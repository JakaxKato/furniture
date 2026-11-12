import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { isAdmin, useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export function Layout() {
  const { user } = useAuth();
  const { count } = useCart();
  const { store } = useStore();
  const location = useLocation();
  const admin = isAdmin(user);
  const searchParams = new URLSearchParams(location.search);
  const category = searchParams.get('category');
  const onCatalog = location.pathname === '/katalog';
  const navClass = (active: boolean) => (active ? 'active' : undefined);

  return (
    <>
      <ScrollToTop />
      <a className="skip-link" href="#konten">
        Lewati ke konten
      </a>
      <header className="site-header">
        <div className="container header__inner">
          <Link to="/" className="brand" aria-label={`${store?.brand.name ?? 'Teduh'} — beranda`}>
            {store?.brand.name ?? 'Teduh'}
            <span className="brand__mark" aria-hidden="true" />
          </Link>
          <nav className="site-nav" aria-label="Navigasi utama">
            <Link to="/katalog" className={navClass(onCatalog && !category)}>
              Katalog
            </Link>
            <Link to="/katalog?category=kasur" className={navClass(onCatalog && category === 'kasur')}>
              Kasur
            </Link>
            <Link to="/katalog?category=bantal" className={navClass(onCatalog && category === 'bantal')}>
              Bantal
            </Link>
            <Link to="/katalog?category=furnitur" className={navClass(onCatalog && category === 'furnitur')}>
              Furnitur
            </Link>
            <Link to="/bantuan" className={navClass(location.pathname === '/bantuan')}>
              Bantuan
            </Link>
          </nav>
          <div className="header__actions">
            {admin ? (
              <Link to="/admin" className="header__action header__action--admin">
                Panel admin
              </Link>
            ) : null}
            <Link
              to={user ? '/akun' : `/masuk?next=${encodeURIComponent(location.pathname + location.search)}`}
              className="header__action"
            >
              {user ? user.name.split(' ')[0] : 'Masuk'}
            </Link>
            <Link to="/keranjang" className="header__action header__cart">
              Keranjang
              <span className="cart-count" aria-label={`${count} item di keranjang`}>
                {count}
              </span>
            </Link>
          </div>
        </div>
        {store?.demoMode && store.demoNotice ? (
          <div className="demo-bar">
            <div className="container">
              <span>{store.demoNotice}</span>
            </div>
          </div>
        ) : null}
      </header>
      <main id="konten" className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer__grid">
          <div className="footer__brand">
            <p className="footer__logo">{store?.brand.name ?? 'Teduh'}</p>
            <p>{store?.brand.description ?? 'Kasur, bantal, dan furnitur dengan ukuran yang jelas.'}</p>
            <p className="footer__note">Ilustrasi produk adalah aset demo orisinal.</p>
          </div>
          <div>
            <h2>Katalog</h2>
            <ul>
              <li>
                <Link to="/katalog?category=kasur">Kasur</Link>
              </li>
              <li>
                <Link to="/katalog?category=bantal">Bantal</Link>
              </li>
              <li>
                <Link to="/katalog?category=furnitur">Furnitur</Link>
              </li>
              <li>
                <Link to="/katalog">Semua produk</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>Bantuan</h2>
            <ul>
              <li>
                <Link to="/bantuan">Bantuan &amp; kebijakan</Link>
              </li>
              <li>
                <Link to="/akun">Akun dan pesanan</Link>
              </li>
              <li>
                <a href={`mailto:${store?.contact.email ?? 'halo@teduh.example'}`}>Email</a>
              </li>
              <li>
                <a
                  href={`https://wa.me/${(store?.contact.whatsapp ?? '').replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>
          <div className="footer__contact">
            <h2>Kontak</h2>
            <p>{store?.contact.email ?? 'halo@teduh.example'}</p>
            <p>{store?.contact.whatsapp ?? '+62 812-0000-0000'}</p>
            <p>{store?.contact.hours ?? 'Senin–Jumat, 09.00–17.00 WIB'}</p>
            {store?.serviceAreas?.length ? (
              <p className="footer__areas">Area layanan demo: {store.serviceAreas.join(', ')}.</p>
            ) : null}
          </div>
        </div>
        <div className="container footer__bottom">
          <p>© {new Date().getFullYear()} {store?.brand.legalName ?? 'Teduh Living (data demo)'}</p>
          <p>Harga dalam Rupiah tanpa pecahan. Dimensi dalam sentimeter.</p>
        </div>
      </footer>
    </>
  );
}
