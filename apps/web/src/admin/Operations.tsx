import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage, formatDate, formatRupiah } from '../lib/api';
import { useResource, localInput, isoInput, type Paged } from '../lib/experience';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/StoreContext';
import { canManage } from './AdminLayout';
import { PageControls } from '../pages/ServicePages';
import { Seo } from '../components/Seo';

type Queue = {
  items: Array<{
    id: string;
    title: string;
    task: string;
    owner: string | null;
    dueAt: string | null;
    href: string;
  }>;
  openPaymentCases: number;
  unassignedCases: number;
};
type Report = {
  revenue: number;
  paidOrders: number;
  placed: number;
  average: number;
  top: Array<{ _id: string; name: string; quantity: number; revenue: number }>;
  events: Array<{ _id: string; count: number }>;
  failures: Array<{ _id: string; count: number }>;
};
export function OperationalDashboard() {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [range, setRange] = useState({ from: today, to: today });
  const report = useResource<Report>(`/admin/report?from=${range.from}&to=${range.to}`);
  const queue = useResource<Queue>('/admin/queue', 30000);
  const [onlyLate, setOnlyLate] = useState(false);
  const labels: Record<string, string> = {
    view_product: 'Produk dilihat',
    select_variant: 'Varian dipilih',
    add_to_cart: 'Ditambah ke keranjang',
    checkout_started: 'Checkout dimulai',
    order_created: 'Pesanan dibuat',
    payment_verified: 'Pembayaran terverifikasi',
    shipping_unavailable: 'Ongkir tidak tersedia',
    payment_review_required: 'Pembayaran perlu ditinjau',
    order_shipped: 'Pesanan dikirim',
  };
  return (
    <>
      <section className="admin-panel">
        <div className="section-heading--split">
          <h2>Antrean tindakan</h2>
          <label className="checkbox-row">
            <input type="checkbox" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} />
            Melewati target
          </label>
        </div>
        <p className="muted">
          Target awal proses: 48 jam setelah lunas, dapat disesuaikan per pesanan. Antrean menampilkan hingga
          100 pesanan dan 50 tiket aktif.
        </p>
        {queue.error && (
          <p role="alert">
            {queue.error} <button onClick={queue.refresh}>Coba lagi</button>
          </p>
        )}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Referensi</th>
                <th>Tindakan</th>
                <th>Penanggung jawab</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {queue.data?.items
                .filter((r) => !onlyLate || (r.dueAt && Date.parse(r.dueAt) < Date.now()))
                .map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={r.href}>{r.title}</Link>
                    </td>
                    <td>{r.task}</td>
                    <td>{r.owner ?? 'Belum ditugaskan'}</td>
                    <td>
                      {r.dueAt ? formatDate(r.dueAt) : 'Belum dijadwalkan'}
                      {r.dueAt && Date.parse(r.dueAt) < Date.now() && (
                        <strong className="field-error"> · Terlambat</strong>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {queue.data?.items.length === 0 && <p>Tidak ada tindakan tertunda.</p>}
        {queue.data && (
          <p>
            Kasus pembayaran terbuka: {queue.data.openPaymentCases} · Belum ditugaskan:{' '}
            {queue.data.unassignedCases}
          </p>
        )}
      </section>
      <section className="admin-panel">
        <h2>Laporan usaha</h2>
        <form
          className="experience-fields"
          onSubmit={(e) => {
            e.preventDefault();
            setRange({ from, to });
          }}
        >
          <label>
            Dari (WIB)
            <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Sampai (WIB)
            <input type="date" required min={from} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="btn">Tampilkan laporan</button>
        </form>
        <p className="muted">
          Penjualan bruto mencakup ongkir, berdasarkan tanggal pembayaran dan pesanan yang saat ini berstatus
          lunas. Refund/sengketa dikecualikan. Angka ini bukan laba atau saldo pencairan.
        </p>
        {report.error && <p role="alert">{report.error}</p>}
        {report.data && (
          <>
            <dl className="experience-metrics">
              <div>
                <dt>Penjualan bruto</dt>
                <dd>{formatRupiah(report.data.revenue)}</dd>
              </div>
              <div>
                <dt>Pesanan lunas</dt>
                <dd>{report.data.paidOrders}</dd>
              </div>
              <div>
                <dt>Pesanan dibuat</dt>
                <dd>{report.data.placed}</dd>
              </div>
              <div>
                <dt>Rata-rata transaksi lunas</dt>
                <dd>{formatRupiah(report.data.average)}</dd>
              </div>
            </dl>
            <h3>Produk terlaris pada periode ini</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Produk / SKU</th>
                    <th>Unit</th>
                    <th>Penjualan barang</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.top.map((p) => (
                    <tr key={p._id}>
                      <td>
                        {p.name}
                        <small> · {p._id}</small>
                      </td>
                      <td>{p.quantity}</td>
                      <td>{formatRupiah(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Aktivitas belanja</h3>
            <p className="muted">Jumlah kejadian, bukan jumlah pengunjung unik atau rasio konversi.</p>
            <ul>
              {report.data.events.map((e) => (
                <li key={e._id}>
                  {labels[e._id] ?? e._id}: {e.count}
                </li>
              ))}
            </ul>
            {report.data.failures.length > 0 && (
              <>
                <h3>Kendala ongkir</h3>
                <ul>
                  {report.data.failures.map((f) => (
                    <li key={f._id}>
                      {f._id ?? 'Tidak diketahui'}: {f.count}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
type Operations = {
  revision: number;
  ownerId?: string | null;
  shipBy?: string | null;
  expectedDelivery?: string | null;
  customerUpdate?: string;
  trackingUrl?: string;
  picked?: boolean;
  packed?: boolean;
  inspected?: boolean;
};
export function OrderOperations({ number }: { number: string }) {
  const { data, error, refresh } = useResource<{
    operations: Operations;
    staff: Array<{ id: string; name: string }>;
  }>(`/admin/orders/${number}/operations`);
  return (
    <section className="admin-panel">
      <h2>Persiapan & komunikasi</h2>
      <a
        className="link-arrow"
        href={`/api/v1/experience/admin/orders/${number}/document`}
        target="_blank"
        rel="noreferrer"
      >
        Cetak daftar ambil & kemas
      </a>
      {error && <p role="alert">{error}</p>}
      {data && (
        <OperationsForm key={data.operations.revision ?? 0} number={number} data={data} refresh={refresh} />
      )}
    </section>
  );
}
function OperationsForm({
  number,
  data,
  refresh,
}: {
  number: string;
  data: { operations: Operations; staff: Array<{ id: string; name: string }> };
  refresh: () => void;
}) {
  const { notify } = useToast();
  const [form, setForm] = useState({
    ownerId: data.operations.ownerId ?? '',
    shipBy: localInput(data.operations.shipBy),
    expectedDelivery: localInput(data.operations.expectedDelivery),
    customerUpdate: data.operations.customerUpdate ?? '',
    trackingUrl: data.operations.trackingUrl ?? '',
    picked: Boolean(data.operations.picked),
    packed: Boolean(data.operations.packed),
    inspected: Boolean(data.operations.inspected),
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const allowed = user && canManage(user, 'fulfill');
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage('');
        try {
          await api.patch(`/experience/admin/orders/${number}/operations`, {
            ...form,
            ownerId: form.ownerId || null,
            shipBy: isoInput(form.shipBy),
            expectedDelivery: isoInput(form.expectedDelivery),
            revision: data.operations.revision ?? 0,
          });
          notify('Persiapan dan informasi pembeli diperbarui.');
          refresh();
        } catch (reason) {
          setMessage(apiErrorMessage(reason));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={!allowed || busy} className="experience-fieldset">
        <div className="experience-fields">
          <label>
            Penanggung jawab
            <select aria-label="Penanggung jawab" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
              <option value="">Belum ditugaskan</option>
              {data.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target serah ke kurir
            <input
              type="datetime-local"
              value={form.shipBy}
              onChange={(e) => setForm({ ...form, shipBy: e.target.value })}
            />
          </label>
          <label>
            Estimasi tiba untuk pembeli
            <input
              type="datetime-local"
              value={form.expectedDelivery}
              onChange={(e) => setForm({ ...form, expectedDelivery: e.target.value })}
            />
          </label>
        </div>
        {(['picked', 'packed', 'inspected'] as const).map((key, i) => (
          <label key={key} className="checkbox-row">
            <input
              type="checkbox"
              checked={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
            />
            {
              [
                'Barang diambil sesuai SKU dan jumlah',
                'Kemasan selesai',
                'Kondisi dan kelengkapan diperiksa',
              ][i]
            }
          </label>
        ))}
        <label>
          Tautan pelacakan kurir (HTTPS)
          <input
            type="url"
            value={form.trackingUrl}
            onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })}
          />
        </label>
        <label>
          Informasi yang ditampilkan ke pembeli
          <textarea
            maxLength={500}
            value={form.customerUpdate}
            onChange={(e) => setForm({ ...form, customerUpdate: e.target.value })}
          />
        </label>
        <button className="btn" disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan pembaruan'}
        </button>
      </fieldset>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
type Stock = {
  sku: string;
  revision: number;
  available: number;
  physical: number;
  reorderPoint: number;
  targetStock: number;
  incoming: number;
  expectedAt: string | null;
  suggested: number;
  low: boolean;
};
export function RestockPage() {
  const [page, setPage] = useState(1);
  const { data, error, refresh } = useResource<Paged<Stock>>(`/admin/restock?page=${page}`);
  return (
    <>
      <Seo title="Perencanaan stok — Teduh" noIndex />
      <p className="eyebrow">Inventaris</p>
      <h1>Perencanaan stok</h1>
      <p className="muted">
        Saran pembelian = target − stok tersedia − barang masuk. Penerimaan barang menambah stok fisik dan
        dicatat dalam audit.
      </p>
      {error && <p role="alert">{error}</p>}
      {data?.items.map((row) => (
        <StockCard
          key={`${row.sku}-${row.revision}`}
          row={row}
          refresh={refresh}
        />
      ))}
      {data && <PageControls page={page} totalPages={data.totalPages} onChange={setPage} />}
    </>
  );
}
function StockCard({ row, refresh }: { row: Stock; refresh: () => void }) {
  const receiptKey = useRef(crypto.randomUUID());
  const [form, setForm] = useState({
    reorderPoint: row.reorderPoint,
    targetStock: row.targetStock,
    incoming: row.incoming,
    expectedAt: localInput(row.expectedAt),
  });
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const act = async (receive: boolean) => {
    setBusy(true);
    setMessage('');
    try {
      if (receive)
        await api.post(`/experience/admin/restock/${row.sku}/receive`, {
          quantity,
          reason,
          key: receiptKey.current,
        });
      else
        await api.patch(`/experience/admin/restock/${row.sku}`, {
          ...form,
          revision: row.revision,
          expectedAt: isoInput(form.expectedAt),
        });
      refresh();
      setMessage('Tersimpan.');
    } catch (e) {
      setMessage(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="admin-panel">
      <summary>
        <strong>{row.sku}</strong> · tersedia {row.available} · masuk {row.incoming} · saran beli{' '}
        {row.suggested}
        {row.low ? ' · Stok rendah' : ''}
      </summary>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void act(false);
        }}
      >
        <div className="experience-fields">
          {(['reorderPoint', 'targetStock', 'incoming'] as const).map((key, i) => (
            <label key={key}>
              {['Batas minimum', 'Target stok', 'Barang masuk direncanakan'][i]}
              <input
                type="number"
                required
                min={0}
                max={100000}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label>
            Estimasi barang masuk
            <input
              type="datetime-local"
              value={form.expectedAt}
              onChange={(e) => setForm({ ...form, expectedAt: e.target.value })}
            />
          </label>
        </div>
        <button className="btn btn--secondary" disabled={busy}>
          Simpan rencana
        </button>
      </form>
      {row.incoming > 0 && (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act(true);
          }}
        >
          <h3>Terima barang</h3>
          <label>
            Jumlah diterima
            <input
              type="number"
              required
              min={1}
              max={row.incoming}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          <label>
            Referensi / catatan penerimaan
            <input
              required
              minLength={5}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button className="btn" disabled={busy}>
            Catat penerimaan
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
