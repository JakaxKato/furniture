import { useEffect, useState } from 'react';
import { AdminPageHead } from './AdminLayout';
import { Seo } from '../components/Seo';
import { api, apiErrorMessage, formatDate } from '../lib/api';

type AuditRow = {
  at: string;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  correlationId: string | null;
  changes: unknown;
};

export function AdminAuditPage() {
  const [data, setData] = useState<{ items: AuditRow[]; total: number; page: number; totalPages: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: AuditRow[]; total: number; page: number; totalPages: number }>(
        `/admin/audit?page=${page}`,
      )
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
  }, [page]);

  return (
    <>
      <Seo title="Audit log — Ruang Teduh" noIndex />
      <AdminPageHead
        eyebrow="Kepatuhan"
        title="Audit log"
        lead="Entri hanya dapat dibaca dari panel; tidak ada endpoint untuk mengubah atau menghapus. Akses dibatasi untuk super admin."
      />
      {error ? <div className="alert alert--error">{error}</div> : null}
      {loading ? (
        <p role="status">Memuat audit…</p>
      ) : !data || data.items.length === 0 ? (
        <div className="admin-empty">Belum ada catatan audit.</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Catatan audit</caption>
              <thead>
                <tr>
                  <th scope="col">Waktu</th>
                  <th scope="col">Pelaku</th>
                  <th scope="col">Tindakan</th>
                  <th scope="col">Target</th>
                  <th scope="col">Ringkasan</th>
                  <th scope="col">Korelasi</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row, index) => (
                  <tr key={`${row.at}-${index}`}>
                    <td>{formatDate(row.at)}</td>
                    <td>{row.actorEmail ?? 'sistem'}</td>
                    <td>{row.action}</td>
                    <td>
                      {row.targetType}
                      {row.targetId ? ` · ${row.targetId}` : ''}
                    </td>
                    <td>{row.summary}</td>
                    <td>
                      <code>{row.correlationId ?? '—'}</code>
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
