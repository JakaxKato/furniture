import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminPageHead, ROLE_LABELS, canManage } from './AdminLayout';
import { Seo } from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/StoreContext';
import { api, apiErrorMessage, formatDate, formatRupiah } from '../lib/api';

type OrderRow = {
  id: string;
  orderNumber: string;
  createdAt: string;
  email: string;
  recipient: string;
  city: string;
  paymentStatus: string;
  shippingStatus: string;
  shippingHold: boolean;
  totals: { subtotal: number; shipping: number; grandTotal: number };
  reservationStatus: string;
  trackingNumber: string | null;
};

type OrderList = { items: OrderRow[]; total: number; page: number; totalPages: number };

const PAYMENT_OPTIONS = [
  'pending',
  'verifying',
  'paid',
  'review',
  'failed',
  'expired',
  'cancelled',
  'partially_refunded',
  'refunded',
  'disputed',
];
const SHIPPING_OPTIONS = ['pending', 'ready', 'shipped', 'delivered'];

export function AdminOrdersPage() {
  const [data, setData] = useState<OrderList | null>(null);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [shippingStatus, setShippingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (appliedQ) params.set('q', appliedQ);
    if (paymentStatus) params.set('paymentStatus', paymentStatus);
    if (shippingStatus) params.set('shippingStatus', shippingStatus);
    if (page > 1) params.set('page', String(page));
    api
      .get<OrderList>(`/admin/orders${params.toString() ? `?${params}` : ''}`)
      .then((response) => {
        if (!cancelled) {
          setData(response);
          setError(null);
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(apiErrorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedQ, paymentStatus, shippingStatus, page]);

  return (
    <>
      <Seo title="Pesanan admin — Teduh" noIndex />
      <AdminPageHead
        eyebrow="Operasional"
        title="Pesanan"
        lead="Status pembayaran dan pengiriman dipisah. Pengiriman hanya dapat diproses setelah pembayaran terverifikasi dan stok dialokasikan."
      />
      <div className="admin-toolbar admin-toolbar--wrap">
        <form
          className="admin-search"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setAppliedQ(q.trim());
          }}
        >
          <label className="sr-only" htmlFor="order-search">
            Cari pesanan
          </label>
          <input
            id="order-search"
            type="search"
            placeholder="Nomor pesanan, email, penerima"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <button type="submit" className="btn btn--small btn--secondary">
            Cari
          </button>
        </form>
        <div className="field field--inline">
          <label htmlFor="filter-payment">Pembayaran</label>
          <select
            id="filter-payment"
            value={paymentStatus}
            onChange={(event) => {
              setPage(1);
              setPaymentStatus(event.target.value);
            }}
          >
            <option value="">Semua</option>
            {PAYMENT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="field field--inline">
          <label htmlFor="filter-shipping">Pengiriman</label>
          <select
            id="filter-shipping"
            value={shippingStatus}
            onChange={(event) => {
              setPage(1);
              setShippingStatus(event.target.value);
            }}
          >
            <option value="">Semua</option>
            {SHIPPING_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? <div className="alert alert--error">{error}</div> : null}
      {loading ? (
        <p role="status">Memuat pesanan…</p>
      ) : !data || data.items.length === 0 ? (
        <div className="admin-empty">Tidak ada pesanan yang cocok.</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Daftar pesanan</caption>
              <thead>
                <tr>
                  <th scope="col">Pesanan</th>
                  <th scope="col">Pelanggan</th>
                  <th scope="col">Pembayaran</th>
                  <th scope="col">Pengiriman</th>
                  <th scope="col">Total</th>
                  <th scope="col">Reservasi</th>
                  <th scope="col">Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.orderNumber}</strong>
                      <span className="muted"> · {formatDate(order.createdAt)}</span>
                    </td>
                    <td>
                      {order.recipient}
                      <span className="muted">
                        {' '}
                        · {order.city} · {order.email}
                      </span>
                    </td>
                    <td>
                      <span className={`status status--${order.paymentStatus === 'paid' ? 'success' : order.paymentStatus === 'review' ? 'warning' : 'neutral'}`}>
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`status status--${order.shippingStatus === 'delivered' ? 'success' : order.shippingStatus === 'shipped' ? 'info' : 'neutral'}`}>
                        {order.shippingStatus}
                      </span>
                      {order.shippingHold ? <span className="status status--warning">hold</span> : null}
                    </td>
                    <td>{formatRupiah(order.totals.grandTotal)}</td>
                    <td>{order.reservationStatus}</td>
                    <td>
                      <Link to={`/admin/pesanan/${order.orderNumber}`} className="link-button">
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 ? (
            <div className="admin-pagination">
              <button type="button" className="btn btn--small btn--secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Sebelumnya
              </button>
              <span>
                Halaman {data.page} dari {data.totalPages}
              </span>
              <button
                type="button"
                className="btn btn--small btn--secondary"
                disabled={page >= data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Berikutnya
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

type Attempt = {
  id: string;
  gatewayOrderId: string;
  status: string;
  open: boolean;
  amount: number;
  gatewayStatus: string | null;
  transactionId: string | null;
  fraudStatus: string | null;
  paymentType: string | null;
  sessionExpiresAt: string;
  methodWindowEndsAt: string;
  lastCheckedAt: string | null;
  createdAt: string;
};

type Case = {
  id: string;
  caseNumber: string;
  type: string;
  status: string;
  reason: string;
  createdAt: string;
};

type AdminOrder = {
  orderNumber: string;
  createdAt: string;
  email: string;
  address: {
    recipient: string;
    phone: string;
    street: string;
    district?: string;
    city: string;
    province: string;
    postalCode: string;
    notes?: string;
  };
  items: Array<{
    sku: string;
    productName: string;
    variantLabel: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
  shipping: {
    zoneName: string;
    zoneVersion: number;
    classes: Array<{ label: string; amount: number }>;
    total: number;
  };
  totals: { subtotal: number; shipping: number; grandTotal: number };
  paymentStatus: string;
  shippingStatus: string;
  shippingHold: { active: boolean; reason?: string };
  reservation: { status: string; expiresAt: string; releasedAt: string | null; allocatedAt: string | null };
  tracking: { courier?: string; trackingNumber?: string; shippedAt?: string; deliveredAt?: string };
  statusHistory: Array<{ at: string; type: string; from?: string; to?: string; note?: string }>;
  paidAt: string | null;
};

type AdminOrderResponse = { order: AdminOrder; attempts: Attempt[]; cases: Case[] };

export function AdminOrderDetailPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const { user } = useAuth();
  const { notify } = useToast();
  const [data, setData] = useState<AdminOrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [courier, setCourier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [holdReason, setHoldReason] = useState('');

  const load = async () => {
    if (!orderNumber) return;
    setLoading(true);
    try {
      const response = await api.get<AdminOrderResponse>(
        `/admin/orders/${encodeURIComponent(orderNumber)}`,
      );
      setData(response);
      setError(null);
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  const act = async (path: string, body?: unknown, successMessage = 'Tindakan tersimpan.') => {
    setBusy(true);
    try {
      await api.post(path, body);
      notify(successMessage);
      await load();
    } catch (reason) {
      notify(apiErrorMessage(reason), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  if (loading) return <p role="status">Memuat pesanan…</p>;
  if (error || !data) {
    return (
      <div>
        <div className="alert alert--error">{error ?? 'Pesanan tidak ditemukan.'}</div>
        <Link to="/admin/pesanan" className="link-arrow">
          Kembali ke daftar pesanan
        </Link>
      </div>
    );
  }

  const order = data.order;
  const canFulfill = canManage(user, 'fulfill');
  const canCases = canManage(user, 'cases');
  const openAttempt = data.attempts.find((attempt) => attempt.open);
  const canReady =
    order.paymentStatus === 'paid' &&
    order.shippingStatus === 'pending' &&
    !order.shippingHold.active &&
    order.reservation.status === 'allocated';

  return (
    <>
      <Seo title={`Pesanan ${order.orderNumber} — Admin`} noIndex />
      <AdminPageHead
        eyebrow="Detail pesanan"
        title={order.orderNumber}
        lead={`${formatDate(order.createdAt)} · ${order.email} · ${ROLE_LABELS[user.role]}`}
        actions={<Link to="/admin/pesanan" className="btn btn--small btn--secondary">Kembali</Link>}
      />
      <div className="alert alert--info">
        Gateway: {data.attempts.length === 0 ? 'belum ada percobaan' : `${data.attempts.length} percobaan`} · Status pembayaran internal {order.paymentStatus} · Status pengiriman {order.shippingStatus}
        {order.shippingHold.active ? ` · DITAHAN: ${order.shippingHold.reason ?? 'tanpa alasan'}` : ''}
      </div>

      <div className="admin-detail-grid">
        <div>
          <section className="admin-panel">
            <h2>Tindakan</h2>
            <div className="admin-actions">
              {openAttempt ? (
                <button
                  type="button"
                  className="btn btn--small btn--secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      `/admin/orders/${order.orderNumber}/reconcile`,
                      undefined,
                      'Pemeriksaan gateway selesai.',
                    )
                  }
                >
                  Periksa ulang pembayaran
                </button>
              ) : null}
              {canFulfill ? (
                <>
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={!canReady || busy}
                    onClick={() =>
                      void act(`/admin/orders/${order.orderNumber}/ready`, undefined, 'Pesanan siap kirim.')
                    }
                  >
                    Tandai siap kirim
                  </button>
                  {order.shippingStatus === 'shipped' ? (
                    <button
                      type="button"
                      className="btn btn--small btn--secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          `/admin/orders/${order.orderNumber}/delivered`,
                          undefined,
                          'Pesanan ditandai diterima.',
                        )
                      }
                    >
                      Tandai diterima
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
            {!canReady && canFulfill && order.shippingStatus === 'pending' ? (
              <p className="muted">
                Siap kirim memerlukan pembayaran lunas, alokasi stok, dan tidak ada hold.
              </p>
            ) : null}

            {canFulfill && order.shippingStatus === 'ready' ? (
              <form
                className="admin-inline-form"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  void act(
                    `/admin/orders/${order.orderNumber}/shipped`,
                    { courier: courier.trim(), trackingNumber: trackingNumber.trim() },
                    'Pesanan dicatat dikirim dan stok fisik dikurangi.',
                  );
                }}
              >
                <div className="field">
                  <label htmlFor="courier">Kurir</label>
                  <input id="courier" required value={courier} onChange={(event) => setCourier(event.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="tracking">Nomor resi / referensi serah terima</label>
                  <input
                    id="tracking"
                    required
                    value={trackingNumber}
                    onChange={(event) => setTrackingNumber(event.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn--small" disabled={busy}>
                  Catat pengiriman
                </button>
              </form>
            ) : null}

            {canCases ? (
              <div className="admin-hold">
                <h3>Penahanan pengiriman</h3>
                {order.shippingHold.active ? (
                  <button
                    type="button"
                    className="btn btn--small btn--secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(`/admin/orders/${order.orderNumber}/release-hold`, undefined, 'Penahanan dilepas.')
                    }
                  >
                    Lepas penahanan
                  </button>
                ) : (
                  <form
                    className="admin-inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void act(
                        `/admin/orders/${order.orderNumber}/hold`,
                        { reason: holdReason.trim() },
                        'Pengiriman ditahan.',
                      );
                    }}
                  >
                    <div className="field field--wide">
                      <label htmlFor="hold-reason">Alasan penahanan</label>
                      <input
                        id="hold-reason"
                        required
                        minLength={5}
                        value={holdReason}
                        onChange={(event) => setHoldReason(event.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn btn--small btn--secondary" disabled={busy}>
                      Tahan pengiriman
                    </button>
                  </form>
                )}
              </div>
            ) : null}
          </section>

          <section className="admin-panel">
            <h2>Produk pada snapshot</h2>
            <ul className="plain-list">
              {order.items.map((item) => (
                <li key={item.sku}>
                  {item.productName} — {item.variantLabel} ({item.sku}) · {item.quantity} ×{' '}
                  {formatRupiah(item.unitPrice)} = {formatRupiah(item.lineTotal)}
                </li>
              ))}
            </ul>
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
            <p className="muted">
              Zona {order.shipping.zoneName} versi {order.shipping.zoneVersion}.
            </p>
          </section>

          <section className="admin-panel">
            <h2>Alamat</h2>
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
          </section>

          <section className="admin-panel">
            <h2>Riwayat status</h2>
            <ol className="timeline">
              {order.statusHistory.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <p className="timeline__time">{formatDate(entry.at)}</p>
                  <p>
                    {entry.type}: {entry.from ?? '—'} → {entry.to ?? '—'}
                  </p>
                  {entry.note ? <p className="muted">{entry.note}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside>
          <section className="admin-panel">
            <h2>Percobaan gateway</h2>
            {data.attempts.length === 0 ? (
              <p className="muted">Belum ada percobaan pembayaran.</p>
            ) : (
              <ul className="attempt-list">
                {data.attempts.map((attempt) => (
                  <li key={attempt.id}>
                    <strong>{attempt.gatewayOrderId}</strong>
                    <span className="muted">
                      {attempt.status} · {attempt.open ? 'terbuka' : 'tertutup'}
                    </span>
                    <span className="muted">
                      Gateway: {attempt.gatewayStatus ?? '—'} · {attempt.paymentType ?? 'kanal belum dipilih'}
                    </span>
                    <span className="muted">
                      Nominal {formatRupiah(attempt.amount)} · tx {attempt.transactionId ?? '—'}
                    </span>
                    <span className="muted">
                      Batas halaman {formatDate(attempt.sessionExpiresAt)} · batas metode{' '}
                      {formatDate(attempt.methodWindowEndsAt)}
                    </span>
                    <span className="muted">Diperiksa {attempt.lastCheckedAt ? formatDate(attempt.lastCheckedAt) : 'belum'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="admin-panel">
            <h2>Kasus</h2>
            {data.cases.length === 0 ? (
              <p className="muted">Tidak ada kasus terkait.</p>
            ) : (
              <ul className="plain-list">
                {data.cases.map((item) => (
                  <li key={item.id}>
                    <Link to="/admin/kasus">{item.caseNumber}</Link> · {item.type} · {item.status}
                    <span className="muted"> — {item.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="admin-panel">
            <h2>Reservasi stok</h2>
            <p>
              Status {order.reservation.status} · batas {formatDate(order.reservation.expiresAt)}
            </p>
            {order.reservation.allocatedAt ? (
              <p className="muted">Dialokasikan {formatDate(order.reservation.allocatedAt)}</p>
            ) : null}
            {order.reservation.releasedAt ? (
              <p className="muted">Dilepas {formatDate(order.reservation.releasedAt)}</p>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}
