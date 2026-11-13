import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPageHead, canManage } from './AdminLayout';
import { Seo } from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { OperationalDashboard } from './Operations';
import { Icon } from '../components/Icon';

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
      <Seo title="Panel admin — Ruang Teduh" noIndex />
      <AdminPageHead
        eyebrow="Operasional"
        title="Pusat operasional"
        lead={`Selamat bekerja, ${user.name.split(' ')[0]}. Ini yang perlu perhatian tim hari ini.`}
      />
      {error ? <div className="alert alert--error">{error}</div> : null}
      {canRead ? (
        <div className="admin-stat-grid">
          <Stat label="Lunas hari ini (WIB)" value={summary?.paid} href="/admin/pesanan?paymentStatus=paid" />
          <Stat label="Siap kirim" value={summary?.ready} href="/admin/pesanan?shippingStatus=ready" />
          <Stat label="Pembayaran dipantau" value={summary?.pendingPayments} href="/admin/pesanan" />
          <Stat label="Kasus terbuka" value={summary?.openCases} href="/admin/kasus" />
          {canManage(user, 'inventory') && <Stat label="SKU di bawah batas stok" value={summary?.lowStock} href="/admin/stok" />}
        </div>
      ) : null}
      {canRead ? <OperationalDashboard /> : null}
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
      <span className="admin-stat__action">Lihat detail <Icon name="arrow" size={16} /></span>
    </Link>
  );
}
