import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { isAdmin, useAuth } from '../context/AuthContext';
import type { User } from '../lib/types';
import { Icon, type IconName } from '../components/Icon';

export const ROLE_LABELS: Record<User['role'], string> = {
  customer: 'Pelanggan',
  admin_catalog: 'Admin katalog',
  admin_ops: 'Admin operasional',
  admin_finance: 'Admin keuangan',
  super_admin: 'Super admin',
};

export function canManage(user: User, permission: string): boolean {
  if (user.role === 'super_admin') return true;
  const map: Record<string, User['role'][]> = {
    catalog: ['admin_catalog'],
    inventory: ['admin_catalog', 'admin_ops'],
    shipping: ['admin_catalog', 'admin_ops'],
    orders: ['admin_ops', 'admin_finance'],
    fulfill: ['admin_ops'],
    cases: ['admin_finance'],
    support: ['admin_ops', 'admin_finance'],
    audit: [],
  };
  return (map[permission] ?? []).includes(user.role);
}

export function AdminLayout() {
  const { user, mfaVerified, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="admin-loading" role="status">
        Memuat sesi admin…
      </div>
    );
  }
  if (!user || !isAdmin(user) || !mfaVerified) {
    return (
      <Navigate
        to={`/admin/masuk?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }

  const links: Array<{ to: string; label: string; show: boolean }> = [
    { to: '/admin', label: 'Ringkasan', show: true },
    { to: '/admin/produk', label: 'Produk', show: canManage(user, 'catalog') },
    { to: '/admin/inventaris', label: 'Inventaris', show: canManage(user, 'inventory') },
    { to: '/admin/stok', label: 'Rencana stok', show: canManage(user, 'inventory') },
    { to: '/admin/layanan', label: 'Layanan pelanggan', show: canManage(user, 'support') },
    { to: '/admin/pengiriman', label: 'Zona & tarif', show: canManage(user, 'shipping') },
    { to: '/admin/pesanan', label: 'Pesanan', show: canManage(user, 'orders') },
    { to: '/admin/kasus', label: 'Kasus', show: canManage(user, 'cases') },
    { to: '/admin/audit', label: 'Audit', show: user.role === 'super_admin' },
  ];
  const icons: IconName[] = ['grid', 'box', 'box', 'clock', 'chat', 'truck', 'bag', 'shield', 'receipt'];
  const activeLabel = [...links].reverse().find((link) => location.pathname === link.to || location.pathname.startsWith(link.to + '/'))?.label ?? 'Ringkasan';

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-konten">
        Lewati ke konten admin
      </a>
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-brand">
          <span>ruang teduh.</span>
          <small>Workspace · Indonesia</small>
        </Link>
        <nav aria-label="Navigasi admin">
          {links
            .filter((link) => link.show)
            .map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === '/admin'}>
                <Icon name={icons[links.indexOf(link)] ?? 'grid'} size={18} />
                {link.label}
              </NavLink>
            ))}
        </nav>
        <div className="admin-sidebar__foot">
          <p>{user.name}</p>
          <p className="muted">{ROLE_LABELS[user.role]}</p>
          <Link to="/" className="admin-sidebar__store">
            Lihat toko
          </Link>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/admin/masuk', { replace: true });
            }}
          >
            Keluar
          </button>
        </div>
      </aside>
      <main id="admin-konten" className="admin-main">
        <div className="admin-topbar"><p>Workspace <span>/</span> <strong>{activeLabel}</strong></p><div><span className="admin-timezone">Waktu Indonesia Barat</span><Link to="/" className="btn btn--secondary btn--small">Lihat toko <Icon name="arrow" size={15} /></Link></div></div>
        <Outlet />
      </main>
    </div>
  );
}

export function AdminPageHead({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-page-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lead ? <p className="muted">{lead}</p> : null}
      </div>
      {actions ? <div className="admin-page-head__actions">{actions}</div> : null}
    </header>
  );
}
