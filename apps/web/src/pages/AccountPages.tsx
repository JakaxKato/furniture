import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PaymentStatus, ShippingStatus } from '../components/StatusBadge';
import { Seo } from '../components/Seo';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { useAuth, isAdmin } from '../context/AuthContext';
import { useStore, useToast } from '../context/StoreContext';
import { ApiError, api, apiErrorMessage, formatDate, formatRupiah } from '../lib/api';
import type { OrderDetail, OrderListResponse, PaymentInfo } from '../lib/types';

function useRequireLogin(next: string) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) navigate(`/masuk?next=${encodeURIComponent(next)}`, { replace: true });
  }, [loading, user, navigate, next]);
  return { user, loading };
}

const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  pending: 'Menunggu',
  verifying: 'Sedang diperiksa',
  paid: 'Pembayaran diterima',
  failed: 'Gagal',
  expired: 'Kedaluwarsa',
  cancelled: 'Dibatalkan',
  review: 'Perlu peninjauan',
  partially_refunded: 'Refund sebagian',
  refunded: 'Refund',
  disputed: 'Sengketa',
  held: 'Stok ditahan',
  allocated: 'Stok dialokasikan',
  released: 'Reservasi dilepas',
  ready: 'Siap kirim',
  shipped: 'Dikirim',
  delivered: 'Diterima',
  on_hold: 'Ditahan',
};

function customerStatusLabel(status: string): string {
  return CUSTOMER_STATUS_LABELS[status] ?? status;
}

export function AccountPage() {
  const { user, loading } = useRequireLogin('/akun');
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<OrderListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!user) return;
    setPageLoading(true);
    setError(null);
    api
      .get<OrderListResponse>('/orders')
      .then(setData)
      .catch((reason) => setError(apiErrorMessage(reason)))
      .finally(() => setPageLoading(false));
  }, [user, retry]);

  if (loading || pageLoading) {
    return (
      <div className="container page">
        <LoadingState label="Memuat akun dan pesanan" />
      </div>
    );
  }

  return (
    <>
      <Seo title="Akun — Teduh" noIndex />
      <div className="container page">
        <header className="page-head page-head--split">
          <div>
            <p className="eyebrow">Akun pelanggan</p>
            <h1>Halo, {user?.name.split(' ')[0]}.</h1>
            <p className="page-head__lead">{user?.email}</p>
          </div>
          <div className="account-actions">
            <Link to="/akun/notifikasi" className="btn btn--secondary btn--small">Notifikasi</Link>
            <Link to="/akun/bantuan" className="btn btn--secondary btn--small">Bantuan & pengajuan</Link>
            {isAdmin(user) ? (
              <Link to="/admin" className="btn btn--secondary btn--small">
                Panel admin
              </Link>
            ) : null}
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={async () => {
                await logout();
                navigate('/', { replace: true });
              }}
            >
              Keluar
            </button>
          </div>
        </header>

        <section aria-labelledby="riwayat">
          <div className="section-heading section-heading--split">
            <h2 id="riwayat">Riwayat pesanan</h2>
            <Link to="/katalog" className="link-arrow">
              Belanja lagi <span aria-hidden="true">→</span>
            </Link>
          </div>

          {error ? (
            <ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              title="Belum ada pesanan"
              message="Pesanan yang dibuat setelah masuk akan muncul di sini beserta status pembayaran dan pengiriman."
            >
              <Link to="/katalog" className="btn">
                Lihat katalog
              </Link>
            </EmptyState>
          ) : (
            <ul className="order-list">
              {data.items.map((order) => (
                <li className="order-card" key={order.orderNumber}>
                  <div className="order-card__head">
                    <div>
                      <p className="order-card__number">{order.orderNumber}</p>
                      <p className="muted">{formatDate(order.createdAt)}</p>
                    </div>
                    <div className="order-card__status">
                      <PaymentStatus status={order.paymentStatus} label={order.paymentLabel} />
                      <ShippingStatus status={order.shippingStatus} label={order.shippingLabel} />
                      {order.shippingHold ? <span className="status status--warning">Ditahan</span> : null}
                    </div>
                  </div>
                  <div className="order-card__body">
                    <div className="order-card__thumbs" aria-hidden="true">
                      {order.items.slice(0, 3).map((item, index) =>
                        item.imageUrl ? (
                          <img
                            key={`${order.orderNumber}-${index}`}
                            src={item.imageUrl}
                            alt=""
                            width={800}
                            height={600}
                            loading="lazy"
                          />
                        ) : null,
                      )}
                    </div>
                    <p>
                      {order.itemCount} item · {formatRupiah(order.totals.grandTotal)}
                    </p>
                    <Link to={`/akun/pesanan/${order.orderNumber}`} className="link-arrow">
                      Lihat pesanan <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

export function OrderDetailPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const { user, loading: authLoading } = useAuth();
  const { store } = useStore();
  const { notify } = useToast();
  const [params] = useSearchParams();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingPayment, setStartingPayment] = useState(false);
  const fromPayment = params.get('from') === 'payment';
  const checking = params.get('checking') === '1';

  const load = useCallback(async () => {
    if (!orderNumber) return;
    setError(null);
    try {
      const response = await api.get<{ order: OrderDetail }>(
        `/orders/${encodeURIComponent(orderNumber)}`,
      );
      setOrder(response.order);
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setPageLoading(false);
      setRefreshing(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    if (!user) return;
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
    return () => window.clearInterval(timer);
  }, [user, load]);

  if (authLoading || (user && pageLoading)) {
    return (
      <div className="container page">
        <LoadingState label="Memuat detail pesanan" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container page page--narrow">
        <h1>Masuk untuk melihat pesanan.</h1>
        <Link
          to={`/masuk?next=${encodeURIComponent(`/akun/pesanan/${orderNumber ?? ''}`)}`}
          className="btn"
        >
          Masuk
        </Link>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="container page page--narrow">
        <ErrorState
          title="Pesanan tidak ditemukan"
          message={error ?? 'Pesanan ini tidak tersedia untuk akunmu.'}
          onRetry={() => {
            setPageLoading(true);
            void load();
          }}
        />
        <p>
          <Link to="/akun" className="link-arrow">
            Kembali ke akun <span aria-hidden="true">→</span>
          </Link>
        </p>
      </div>
    );
  }

  const contact = store?.contact;
  const showReview = order.paymentStatus === 'review';

  return (
    <>
      <Seo title={`Pesanan ${order.orderNumber} — Teduh`} noIndex />
      <div className="container page">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/akun">Akun</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Pesanan {order.orderNumber}</span>
        </nav>

        <header className="page-head page-head--split">
          <div>
            <p className="eyebrow">Detail pesanan</p>
            <h1>{order.orderNumber}</h1>
            <p className="page-head__lead">
              Dibuat {formatDate(order.createdAt)} · {order.email}
            </p>
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--small"
            onClick={() => {
              setRefreshing(true);
              void load();
            }}
            disabled={refreshing}
          >
            {refreshing ? 'Memeriksa…' : 'Periksa status'}
          </button>
        </header>

        <section className="panel order-progress" aria-label="Perkembangan pesanan">
          <h2>{order.shippingHold.active ? 'Tim kami sedang menangani pesanan Anda' : order.shippingStatus === 'delivered' ? 'Pesanan telah diterima' : order.shippingStatus === 'shipped' ? 'Pesanan dalam pengiriman' : order.shippingStatus === 'ready' ? 'Pesanan siap diserahkan ke kurir' : order.paymentStatus === 'paid' ? 'Pembayaran diterima, pesanan sedang disiapkan' : ['failed', 'expired', 'cancelled'].includes(order.paymentStatus) ? 'Pembayaran ditutup' : ['refunded', 'partially_refunded'].includes(order.paymentStatus) ? 'Pengembalian dana tercatat' : ['review', 'verifying', 'disputed'].includes(order.paymentStatus) ? 'Tim kami sedang memeriksa pembayaran' : 'Selesaikan pembayaran untuk melanjutkan'}</h2>
          {order.customerUpdate && <p className="preserve-lines">{order.customerUpdate}</p>}
          {order.expectedDelivery && <p>Estimasi tiba: <strong>{formatDate(order.expectedDelivery)}</strong>. Estimasi dapat diperbarui oleh tim pengiriman.</p>}
          <p className="muted">Pembaruan terakhir: {formatDate(order.updatedAt)} · Halaman diperbarui otomatis setiap 15 detik.</p>
          <div className="account-actions">
            {order.trackingUrl && <a className="btn btn--small" href={order.trackingUrl} target="_blank" rel="noreferrer">Lacak pengiriman</a>}
            <a className="btn btn--secondary btn--small" href={`/api/v1/experience/orders/${order.orderNumber}/document`} target="_blank" rel="noreferrer">Cetak / simpan ringkasan PDF</a>
            <Link className="btn btn--secondary btn--small" to={`/akun/bantuan?order=${encodeURIComponent(order.orderNumber)}`}>Bantuan / retur / refund</Link>
          </div>
        </section>
        {fromPayment || checking ? (
          <div className="alert alert--info" role="status">
            Status pembayaran diperbarui otomatis. Anda tidak perlu membayar ulang saat verifikasi berlangsung.
          </div>
        ) : null}

        {order.paymentStatus === 'verifying' ? (
          <div className="alert alert--warning" role="status">
            <strong>Sedang memeriksa pembayaran.</strong> Pesanan dan stok ditahan sementara. Tekan
            “Periksa status” setelah menyelesaikan pembayaran.
          </div>
        ) : null}

        {showReview ? (
          <div className="alert alert--error" role="alert">
            <p>
              <strong>Pembayaran sedang ditinjau.</strong>{' '}
              {order.shippingHold.reason ?? 'Pengiriman ditahan sampai pemeriksaan selesai.'}
            </p>
            {contact ? (
              <p>
                Hubungi <a href={`mailto:${contact.email}`}>{contact.email}</a> atau{' '}
                <a
                  href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp {contact.whatsapp}
                </a>
                .
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="order-detail-grid">
          <div className="order-detail-main">
            <section className="panel" aria-labelledby="status-pesanan">
              <h2 id="status-pesanan">Status</h2>
              <div className="status-pair">
                <div>
                  <p className="field-label">Pembayaran</p>
                  <PaymentStatus status={order.paymentStatus} label={order.paymentLabel} />
                </div>
                <div>
                  <p className="field-label">Pengiriman</p>
                  <ShippingStatus status={order.shippingStatus} label={order.shippingLabel} />
                </div>
              </div>
              {order.reservationActive && order.reservationExpiresAt ? (
                <p className="muted">
                  Stok ditahan sampai {formatDate(order.reservationExpiresAt)}. Batas ini mengikuti
                  jendela pembayaran yang dikonfigurasi.
                </p>
              ) : null}
              {order.paymentStatus === 'pending' && order.canContinuePayment && order.paymentRedirectUrl ? (
                <a className="btn" href={order.paymentRedirectUrl}>
                  Lanjutkan pembayaran
                </a>
              ) : null}
              {order.paymentStatus === 'pending' && !order.canContinuePayment && order.reservationActive ? (
                <button
                  type="button"
                  className="btn"
                  disabled={startingPayment}
                  onClick={async () => {
                    setStartingPayment(true);
                    try {
                      const response = await api.post<{ payment: PaymentInfo }>(
                        `/orders/${encodeURIComponent(order.orderNumber)}/payment`,
                      );
                      if (response.payment.redirectUrl) {
                        window.location.assign(response.payment.redirectUrl);
                        return;
                      }
                      notify(
                        response.payment.uncertain
                          ? 'Pembayaran sedang diperiksa. Status akan diperbarui dari backend.'
                          : 'Pembayaran belum dapat dimulai. Coba lagi.',
                      );
                      await load();
                    } catch (reason) {
                      notify(apiErrorMessage(reason), 'error');
                      if (
                        reason instanceof ApiError &&
                        ['ORDER_NOT_PAYABLE', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_UNCERTAIN', 'ORDER_CLOSED'].includes(
                          reason.code,
                        )
                      ) {
                        await load();
                      }
                    } finally {
                      setStartingPayment(false);
                    }
                  }}
                >
                  {startingPayment ? 'Menyiapkan pembayaran…' : 'Mulai pembayaran'}
                </button>
              ) : null}
              {['failed', 'expired', 'cancelled'].includes(order.paymentStatus) ? (
                <p>
                  Percobaan pembayaran sudah ditutup. Buat pesanan baru setelah memeriksa stok dan
                  ongkir terbaru.{' '}
                  <Link to="/keranjang" className="link-arrow">
                    Kembali ke keranjang
                  </Link>{' '}
                  atau{' '}
                  <Link to="/katalog" className="link-arrow">
                    belanja lagi
                  </Link>
                  .
                </p>
              ) : null}
              {order.tracking ? (
                <div className="tracking">
                  <h3>Pengiriman</h3>
                  <p>
                    {order.tracking.courier ?? 'Kurir'} · Resi{' '}
                    <strong>{order.tracking.trackingNumber}</strong>
                  </p>
                  {order.tracking.shippedAt ? (
                    <p className="muted">Dikirim {formatDate(order.tracking.shippedAt)}</p>
                  ) : null}
                  {order.tracking.deliveredAt ? (
                    <p className="muted">Diterima {formatDate(order.tracking.deliveredAt)}</p>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="panel" aria-labelledby="item-pesanan">
              <h2 id="item-pesanan">Produk</h2>
              <ul className="order-items">
                {order.items.map((item) => (
                  <li key={item.sku}>
                    <span className="order-items__media">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" width={800} height={600} loading="lazy" />
                      ) : null}
                    </span>
                    <span>
                      <strong>{item.productName}</strong>
                      <span className="muted">{item.variantLabel}</span>
                      <span className="muted">SKU {item.sku}</span>
                    </span>
                    <span>
                      {item.quantity} × {formatRupiah(item.unitPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel" aria-labelledby="alamat-pesanan">
              <h2 id="alamat-pesanan">Alamat pengiriman</h2>
              <address>
                {order.address.recipient}
                <br />
                {order.address.street}
                {order.address.district ? (
                  <>
                    <br />
                    {order.address.district}
                  </>
                ) : null}
                <br />
                {order.address.city}, {order.address.province} {order.address.postalCode}
                <br />
                {order.address.phone}
              </address>
              {order.address.notes ? <p className="muted">Catatan: {order.address.notes}</p> : null}
              <p className="muted">
                Zona {order.shipping.zoneName} · aturan versi {order.shipping.zoneVersion}
              </p>
            </section>

            <section className="panel" aria-labelledby="riwayat-status">
              <h2 id="riwayat-status">Riwayat status</h2>
              <ol className="timeline">
                {order.statusHistory.map((entry, index) => (
                  <li key={`${entry.at}-${index}`}>
                    <p className="timeline__time">{formatDate(entry.at)}</p>
                    <p>
                      {entry.type === 'payment'
                        ? 'Pembayaran'
                        : entry.type === 'shipping'
                          ? 'Pengiriman'
                          : entry.type === 'hold'
                            ? 'Penahanan'
                            : 'Catatan'}
                      {entry.to ? `: ${customerStatusLabel(entry.to)}` : ''}
                    </p>
                    {entry.note ? <p className="muted">{entry.note}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside className="panel panel--summary" aria-label="Rincian biaya">
            <h2>Rincian biaya</h2>
            <dl className="totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatRupiah(order.totals.subtotal)}</dd>
              </div>
              {order.shipping.classes.map((line) => (
                <div key={line.label}>
                  <dt>Ongkir {line.label}</dt>
                  <dd>{formatRupiah(line.amount)}</dd>
                </div>
              ))}
              <div className="totals__grand">
                <dt>Total</dt>
                <dd>{formatRupiah(order.totals.grandTotal)}</dd>
              </div>
            </dl>
            {order.shipping.estimatedDays ? (
              <p className="muted">
                Estimasi {order.shipping.estimatedDays.min}–{order.shipping.estimatedDays.max} hari
                kerja.
              </p>
            ) : null}
            <p className="muted">
              Alamat, SKU, dan nominal pada pesanan tidak berubah setelah dibuat. Hubungi support
              jika perlu perubahan.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}
