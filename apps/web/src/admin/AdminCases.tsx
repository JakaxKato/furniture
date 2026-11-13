import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPageHead } from './AdminLayout';
import { Seo } from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/StoreContext';
import { api, apiErrorMessage, formatDate } from '../lib/api';

type CaseRow = {
  id: string;
  caseNumber: string;
  type: string;
  status: 'open' | 'in_progress' | 'resolved';
  priority: string;
  reason: string;
  createdAt: string;
  orderNumber: string | null;
  orderPaymentStatus: string | null;
};

type CaseList = { items: CaseRow[]; total: number; page: number; totalPages: number };

const TYPE_LABELS: Record<string, string> = {
  amount_mismatch: 'Nominal tidak cocok',
  late_payment: 'Pembayaran terlambat',
  gateway_conflict: 'Konflik status gateway',
  uncertain_payment: 'Pembayaran belum pasti',
  refund: 'Refund',
  chargeback: 'Chargeback',
  stock_issue: 'Masalah stok',
  shipping_issue: 'Masalah pengiriman',
};

export function AdminCasesPage() {
  const { notify } = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<CaseList | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    api
      .get<CaseList>(`/admin/cases${params.toString() ? `?${params}` : ''}`)
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
  }, [status, refresh]);

  const updateCase = async (row: CaseRow, nextStatus: CaseRow['status'], note?: string) => {
    setPending(row.id);
    try {
      await api.patch(`/admin/cases/${row.id}`, {
        status: nextStatus,
        ...(nextStatus === 'in_progress' && user ? { ownerId: user.id } : {}),
        ...(note?.trim() ? { note: note.trim() } : {}),
      });
      notify(`Kasus ${row.caseNumber} diperbarui.`);
      setNotes((current) => ({ ...current, [row.id]: '' }));
      setRefresh((value) => value + 1);
    } catch (reason) {
      notify(apiErrorMessage(reason), 'error');
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <Seo title="Kasus pembayaran — Ruang Teduh" noIndex />
      <AdminPageHead
        eyebrow="Keuangan dan support"
        title="Kasus pembayaran"
        lead="Tindakan manual tidak dapat menetapkan status lunas. Keputusan refund, chargeback, dan pembayaran terlambat dicatat beserta alasannya."
      />
      <div className="admin-toolbar">
        <div className="field field--inline">
          <label htmlFor="case-status">Status kasus</label>
          <select id="case-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Semua</option>
            <option value="open">Terbuka</option>
            <option value="in_progress">Ditangani</option>
            <option value="resolved">Selesai</option>
          </select>
        </div>
      </div>
      {error ? <div className="alert alert--error">{error}</div> : null}
      {loading ? (
        <p role="status">Memuat kasus…</p>
      ) : !data || data.items.length === 0 ? (
        <div className="admin-empty">Tidak ada kasus pada filter ini.</div>
      ) : (
        <div className="case-grid">
          {data.items.map((row) => (
            <article className="admin-panel case-card" key={row.id}>
              <div className="case-card__head">
                <div>
                  <p className="eyebrow">{row.caseNumber}</p>
                  <h2>{TYPE_LABELS[row.type] ?? row.type}</h2>
                  <p className="muted">
                    {formatDate(row.createdAt)} · prioritas {row.priority}
                    {row.orderNumber ? (
                      <>
                        {' '}
                        ·{' '}
                        <Link to={`/admin/pesanan/${row.orderNumber}`}>Pesanan {row.orderNumber}</Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <span className={`status status--${row.status === 'resolved' ? 'success' : row.status === 'open' ? 'warning' : 'info'}`}>
                  {row.status}
                </span>
              </div>
              <p>{row.reason}</p>
              <p className="muted">Status pembayaran pesanan: {row.orderPaymentStatus ?? '—'}</p>
              <div className="field">
                <label htmlFor={`case-note-${row.id}`}>Catatan tindakan</label>
                <textarea
                  id={`case-note-${row.id}`}
                  rows={2}
                  value={notes[row.id] ?? ''}
                  onChange={(event) => setNotes({ ...notes, [row.id]: event.target.value })}
                />
              </div>
              <div className="admin-actions">
                {row.status !== 'in_progress' ? (
                  <button
                    type="button"
                    className="btn btn--small btn--secondary"
                    disabled={pending === row.id}
                    onClick={() => void updateCase(row, 'in_progress', notes[row.id])}
                  >
                    Tandai ditangani
                  </button>
                ) : null}
                {row.status !== 'resolved' ? (
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={pending === row.id || !notes[row.id]?.trim()}
                    onClick={() => void updateCase(row, 'resolved', notes[row.id])}
                  >
                    Selesaikan dengan catatan
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
