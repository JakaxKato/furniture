import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PurchaseSteps } from '../components/PurchaseSteps';
import { Seo } from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { api, apiErrorMessage, formatRupiah } from '../lib/api';

type SimulationView = {
  orderNumber: string;
  amount: number;
  attemptStatus: string;
  paymentStatus: string;
  items: Array<{ name: string; variant: string; quantity: number; lineTotal: number }>;
  totals: { subtotal: number; shipping: number; grandTotal: number };
};

export function SimulationPaymentPage() {
  const { gatewayOrderId } = useParams<{ gatewayOrderId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { store } = useStore();
  const navigate = useNavigate();
  const [data, setData] = useState<SimulationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !gatewayOrderId) return;
    setLoading(true);
    api
      .get<SimulationView>(`/payments/simulation/${encodeURIComponent(gatewayOrderId)}`)
      .then(setData)
      .catch((reason) => setError(apiErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, [user, gatewayOrderId]);

  if (authLoading || loading) {
    return (
      <div className="container page page--narrow"><PurchaseSteps stage={3} />
        <p role="status">Memuat halaman simulasi pembayaran…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container page page--narrow"><PurchaseSteps stage={3} />
        <h1>Masuk untuk melanjutkan pembayaran.</h1>
        <Link
          to={`/masuk?next=${encodeURIComponent(`/pembayaran-simulasi/${gatewayOrderId ?? ''}`)}`}
          className="btn"
        >
          Masuk
        </Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container page page--narrow"><PurchaseSteps stage={3} />
        <h1>Simulasi pembayaran tidak tersedia</h1>
        <p>{error ?? 'Transaksi simulasi tidak ditemukan.'}</p>
        <Link to="/akun" className="btn btn--secondary">
          Kembali ke akun
        </Link>
      </div>
    );
  }

  const act = async (action: 'settlement' | 'deny' | 'expire' | 'capture_challenge') => {
    if (!gatewayOrderId) return;
    setBusy(action);
    setError(null);
    try {
      await api.post(`/payments/simulation/${encodeURIComponent(gatewayOrderId)}`, { action });
      navigate(`/akun/pesanan/${data.orderNumber}?from=payment`);
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Seo title="Simulasi pembayaran — Ruang Teduh" noIndex />
      <div className="container page page--narrow"><PurchaseSteps stage={3} />
        <div className="alert alert--info" role="note">
          Lingkungan simulasi pengembangan. Tidak ada uang yang diproses dan tidak ada data kartu
          yang diminta.
        </div>
        <header className="page-head">
          <p className="eyebrow">Pembayaran simulasi</p>
          <h1>Pesanan {data.orderNumber}</h1>
          <p className="page-head__lead">
            Total tagihan <strong>{formatRupiah(data.amount)}</strong>. Pilih hasil simulasi untuk
            menguji pembaruan status dari backend.
          </p>
        </header>
        <div className="panel">
          <h2>Rincian</h2>
          <ul className="quote-lines">
            {data.items.map((item, index) => (
              <li className="quote-line" key={`${item.name}-${index}`}>
                <span>
                  {item.name} — {item.variant} × {item.quantity}
                </span>
                <span>{formatRupiah(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatRupiah(data.totals.subtotal)}</dd>
            </div>
            <div>
              <dt>Ongkir</dt>
              <dd>{formatRupiah(data.totals.shipping)}</dd>
            </div>
            <div className="totals__grand">
              <dt>Total</dt>
              <dd>{formatRupiah(data.totals.grandTotal)}</dd>
            </div>
          </dl>
          <p className="muted">
            Status saat ini: percobaan {data.attemptStatus}, pembayaran {data.paymentStatus}.
          </p>
        </div>

        {error ? (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="simulation-actions">
          <button
            type="button"
            className="btn"
            onClick={() => void act('settlement')}
            disabled={busy !== null}
          >
            {busy === 'settlement' ? 'Memproses…' : 'Simulasikan pembayaran diterima'}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => void act('deny')}
            disabled={busy !== null}
          >
            Simulasikan pembayaran gagal
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => void act('expire')}
            disabled={busy !== null}
          >
            Simulasikan pembayaran kedaluwarsa
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => void act('capture_challenge')}
            disabled={busy !== null}
          >
            Simulasikan capture dengan fraud challenge
          </button>
        </div>
        <p className="muted">
          Aksi simulasi memakai jalur transisi status yang sama dengan webhook terverifikasi. Halaman
          ini hanya muncul pada adapter simulasi di lingkungan non-produksi.
        </p>
        {store?.paymentChannels.length ? (
          <p className="muted">Kanal demo: {store.paymentChannels.join(', ')}.</p>
        ) : null}
      </div>
    </>
  );
}

export function HelpPage() {
  const { store, loading, error, reload } = useStore();

  return (
    <>
      <Seo
        title="Bantuan dan kebijakan — Ruang Teduh"
        description="Kontak resmi, area layanan, dan kebijakan pengiriman yang telah dikonfirmasi."
      />
      <div className="container page page--narrow">
        <header className="page-head">
          <p className="eyebrow">Bantuan</p>
          <h1>Kontak dan kebijakan.</h1>
          <p className="page-head__lead">
            Hanya kebijakan yang sudah disetujui yang ditampilkan. Kontak di bawah adalah data demo.
          </p>
        </header>

        {loading ? <p role="status">Memuat informasi kontak…</p> : null}
        {error ? (
          <div className="alert alert--error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn--small btn--secondary" onClick={reload}>
              Coba lagi
            </button>
          </div>
        ) : null}

        {store ? (
          <>
            <section className="panel" aria-labelledby="kontak">
              <h2 id="kontak">Kontak resmi</h2>
              <p>
                Email: <a href={`mailto:${store.contact.email}`}>{store.contact.email}</a>
              </p>
              <p>
                WhatsApp:{' '}
                <a
                  href={`https://wa.me/${store.contact.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {store.contact.whatsapp}
                </a>
              </p>
              <p>Jam layanan: {store.contact.hours}</p>
              <p className="muted">{store.contact.address}</p>
            </section>

            <section className="panel" aria-labelledby="area">
              <h2 id="area">Area layanan contoh</h2>
              <p>Kota yang tersedia di formulir checkout:</p>
              <ul className="plain-list">
                {store.areas.map((area) => (
                  <li key={area.name}>
                    <strong>{area.name}</strong> — {area.cities.join(', ')}
                  </li>
                ))}
              </ul>
              <p className="muted">
                Ongkir dihitung ulang di server dari kode pos, zona aktif, dan kelas kirim. Jika tarif
                tidak lengkap, pembayaran diblokir dan kontak di atas ditampilkan.
              </p>
            </section>

            {Object.entries(store.policies).map(([key, policy]) => (
              <section className="panel" aria-labelledby={`policy-${key}`} key={key}>
                <h2 id={`policy-${key}`}>{policy.title}</h2>
                <p>{policy.body}</p>
              </section>
            ))}

            {store.demoMode && store.demoNotice ? (
              <div className="alert alert--info" role="note">
                {store.demoNotice}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}

export function NotFoundPage() {
  return (
    <>
      <Seo title="Halaman tidak ditemukan — Ruang Teduh" noIndex />
      <div className="container page page--narrow">
        <p className="eyebrow">404</p>
        <h1>Halaman tidak ditemukan.</h1>
        <p>Tautan mungkin sudah berubah atau produk telah diarsipkan.</p>
        <div className="hero__actions">
          <Link to="/katalog" className="btn">
            Lihat katalog
          </Link>
          <Link to="/" className="link-arrow">
            Beranda <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </>
  );
}
