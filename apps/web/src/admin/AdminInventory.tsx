import { useEffect, useState, type FormEvent } from 'react';
import { AdminPageHead } from './AdminLayout';
import { Dialog } from '../components/Dialog';
import { Seo } from '../components/Seo';
import { useToast } from '../context/StoreContext';
import { api, apiErrorMessage, formatDate } from '../lib/api';

type InventoryRow = {
  sku: string;
  productName: string | null;
  variantLabel: string | null;
  physical: number;
  held: number;
  allocated: number;
  available: number;
  updatedAt: string;
};

export function AdminInventoryPage() {
  const { notify } = useToast();
  const [data, setData] = useState<{ items: InventoryRow[]; total: number; page: number; totalPages: number } | null>(null);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<InventoryRow | null>(null);
  const [physical, setPhysical] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (appliedQ) params.set('q', appliedQ);
    api
      .get<{ items: InventoryRow[]; total: number; page: number; totalPages: number }>(
        `/admin/inventory${params.toString() ? `?${params}` : ''}`,
      )
      .then((response) => {
        if (!cancelled) {
          setData(response);
          setError(null);
        }
      })
      .catch((reasonValue) => {
        if (!cancelled) setError(apiErrorMessage(reasonValue));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedQ, refresh]);

  const openAdjust = (row: InventoryRow) => {
    setSelected(row);
    setPhysical(String(row.physical));
    setReason('');
  };

  const saveAdjust = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/admin/inventory/${encodeURIComponent(selected.sku)}/adjust`, {
        physical: Number(physical),
        reason: reason.trim(),
      });
      notify(`Stok fisik ${selected.sku} diperbarui.`);
      setSelected(null);
      setRefresh((value) => value + 1);
    } catch (reasonValue) {
      notify(apiErrorMessage(reasonValue), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Seo title="Inventaris admin — Ruang Teduh" noIndex />
      <AdminPageHead
        eyebrow="Inventaris"
        title="Stok per SKU"
        lead="Stok tersedia = fisik − ditahan − dialokasikan. Penyesuaian tidak boleh menurunkan fisik di bawah komitmen."
      />
      <div className="admin-toolbar">
        <form
          className="admin-search"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedQ(q.trim());
          }}
        >
          <label className="sr-only" htmlFor="inventory-search">
            Cari SKU
          </label>
          <input id="inventory-search" type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Cari SKU" />
          <button type="submit" className="btn btn--small btn--secondary">
            Cari
          </button>
        </form>
      </div>
      {error ? <div className="alert alert--error">{error}</div> : null}
      {loading ? (
        <p role="status">Memuat inventaris…</p>
      ) : !data || data.items.length === 0 ? (
        <div className="admin-empty">Tidak ada SKU yang cocok.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">Daftar stok</caption>
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">Produk</th>
                <th scope="col">Fisik</th>
                <th scope="col">Ditahan</th>
                <th scope="col">Dialokasikan</th>
                <th scope="col">Tersedia</th>
                <th scope="col">Diperbarui</th>
                <th scope="col">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.sku}>
                  <td>
                    <strong>{row.sku}</strong>
                  </td>
                  <td>
                    {row.productName ?? '—'}
                    <span className="muted"> {row.variantLabel ? `· ${row.variantLabel}` : ''}</span>
                  </td>
                  <td>{row.physical}</td>
                  <td>{row.held}</td>
                  <td>{row.allocated}</td>
                  <td>
                    <strong>{row.available}</strong>
                  </td>
                  <td>{formatDate(row.updatedAt)}</td>
                  <td>
                    <button type="button" className="link-button" onClick={() => openAdjust(row)}>
                      Sesuaikan
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={`Sesuaikan stok ${selected?.sku ?? ''}`}
      >
        {selected ? (
          <form className="form-stack" onSubmit={saveAdjust}>
            <p className="muted">
              Fisik saat ini {selected.physical}; ditahan {selected.held}; dialokasikan {selected.allocated}.
              Minimum fisik {selected.held + selected.allocated}.
            </p>
            <div className="field">
              <label htmlFor="adjust-physical">Stok fisik baru</label>
              <input
                id="adjust-physical"
                type="number"
                min={selected.held + selected.allocated}
                required
                value={physical}
                onChange={(event) => setPhysical(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="adjust-reason">Alasan penyesuaian</label>
              <textarea
                id="adjust-reason"
                required
                minLength={5}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan stok'}
            </button>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
