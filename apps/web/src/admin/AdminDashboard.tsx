import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPageHead, canManage } from './AdminLayout';
import { Seo } from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

type Summary = { paid: number; ready: number; openCases: number; lowStock: number; pendingPayments: number };

export function AdminDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canRead = user ? canManage(user, 'orders') : false;

  useEffect(() => {
    if (!canRead) return;
    api
      .get<Summary>('/admin/summary')
      .then(setSummary)
      .catch(() => setError('Ringkasan tidak dapat dimuat untuk peran ini.'));
  }, [canRead]);

  if (!user) return null;

  return (
    <>
      <Seo title="Panel admin — Teduh" noIndex />
      <AdminPageHead
        eyebrow="Operasional"
        title="Ringkasan hari ini"
        lead="Angka diambil langsung dari basis data. Tindakan sensitif tercatat di audit log."
      />
      {error ? <div className="alert alert--error">{error}</div> : null}
      {canRead ? (
        <div className="admin-stat-grid">
          <Stat label="Pesanan lunas" value={summary?.paid} href="/admin/pesanan?paymentStatus=paid" />
          <Stat label="Siap kirim" value={summary?.ready} href="/admin/pesanan?shippingStatus=ready" />
          <Stat label="Pembayaran dipantau" value={summary?.pendingPayments} href="/admin/pesanan" />
          <Stat label="Kasus terbuka" value={summary?.openCases} href="/admin/kasus" />
          <Stat label="SKU stok rendah (≤ 2)" value={summary?.lowStock} href="/admin/inventaris" />
        </div>
      ) : null}
      <section className="admin-panel">
        <h2>Tautan cepat</h2>
        <div className="admin-links">
          {canManage(user, 'catalog') ? <Link to="/admin/produk">Kelola produk &amp; varian</Link> : null}
          {canManage(user, 'inventory') ? <Link to="/admin/inventaris">Sesuaikan stok</Link> : null}
          {canManage(user, 'shipping') ? <Link to="/admin/pengiriman">Zona dan tarif kirim</Link> : null}
          {canManage(user, 'orders') ? <Link to="/admin/pesanan">Antrean pesanan</Link> : null}
          {canManage(user, 'cases') ? <Link to="/admin/kasus">Kasus pembayaran</Link> : null}
          {user.role === 'super_admin' ? <Link to="/admin/audit">Audit log</Link> : null}
        </div>
      </section>
      <section className="admin-panel">
        <h2>Catatan operasional</h2>
        <ul className="plain-list">
          <li>Pesanan hanya dapat ditandai siap kirim setelah lunas, stok dialokasikan, dan tidak ditahan.</li>
          <li>Status pembayaran mengikuti verifikasi gateway; admin tidak dapat menetapkan lunas secara manual.</li>
          <li>Refund dan chargeback dicatat sebagai kasus baru dan tidak mengembalikan stok otomatis.</li>
          <li>Perubahan harga, stok, tarif, dan pengiriman dicatat dengan ID korelasi.</li>
        </ul>
      </section>
    </>
  );
}

function Stat({ label, value, href }: { label: string; value?: number; href: string }) {
  return (
    <Link to={href} className="admin-stat">
      <span className="admin-stat__label">{label}</span>
      <span className="admin-stat__value">{value ?? '—'}</span>
    </Link>
  );
}
