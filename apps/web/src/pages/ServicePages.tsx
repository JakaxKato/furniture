import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage, formatDate } from '../lib/api';
import { type Paged, type Ticket, ticketLabels, useResource, localInput, isoInput } from '../lib/experience';
import { Seo } from '../components/Seo';

export function PageControls({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Halaman hasil">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Sebelumnya
      </button>
      <span>
        {page} / {totalPages}
      </span>
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Berikutnya
      </button>
    </nav>
  );
}
export function ServicePage({ admin = false }: { admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Memuat sesi…</p>;
  if (!user) return <Navigate to="/masuk?next=%2Fakun%2Fbantuan" replace />;
  return <TicketList admin={admin} />;
}
function TicketList({ admin }: { admin: boolean }) {
  const [params] = useSearchParams();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, error, refresh } = useResource<Paged<Ticket>>(
    `${admin ? '/admin' : ''}/tickets?page=${page}${status ? `&status=${status}` : ''}`,
    30000,
  );
  const [orderNumber, setOrderNumber] = useState(params.get('order') ?? '');
  const [kind, setKind] = useState('help');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <div className={admin ? '' : 'container page'}>
      <Seo title="Layanan pesanan — Teduh" noIndex />
      <p className="eyebrow">{admin ? 'Layanan pelanggan' : 'Akun pelanggan'}</p>
      <h1>Bantuan, retur & refund</h1>
      <p className="muted">
        Setiap pengajuan terhubung ke pesanan. Balasan, keputusan, dan target tindak lanjut tersimpan di sini.
      </p>
      {admin ? (
        <div className="field">
          <label htmlFor="ticket-filter">Filter status</label>
          <select
            id="ticket-filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua status</option>
            {['open', 'in_progress', 'waiting_customer', 'approved', 'resolved', 'rejected'].map((s) => (
              <option key={s} value={s}>
                {ticketLabels[s]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <details className="panel" open={Boolean(params.get('order'))}>
          <summary>Buat pengajuan</summary>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage('');
              try {
                await api.post('/experience/tickets', {
                  orderNumber,
                  kind,
                  subject,
                  body,
                  ...(evidenceUrl ? { evidenceUrl } : {}),
                });
                setSubject('');
                setBody('');
                setEvidenceUrl('');
                setMessage(
                  'Pengajuan terkirim. Target tanggapan awal 48 jam; lihat perkembangannya di bawah.',
                );
                refresh();
              } catch (reason) {
                setMessage(apiErrorMessage(reason));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Nomor pesanan
              <input required value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
            </label>
            <label>
              Jenis pengajuan
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {['help', 'shipping', 'return', 'refund'].map((s) => (
                  <option key={s} value={s}>
                    {ticketLabels[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Judul
              <input
                required
                minLength={5}
                maxLength={160}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label>
              Jelaskan kendala
              <textarea
                required
                minLength={5}
                maxLength={2000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <label>
              Tautan bukti HTTPS (opsional)
              <input type="url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
            </label>
            <p className="muted">
              Retur/refund diperiksa sesuai kondisi pesanan. Persetujuan pengajuan belum berarti dana telah
              dikembalikan.
            </p>
            <button className="btn" disabled={busy}>
              {busy ? 'Mengirim…' : 'Kirim pengajuan'}
            </button>
          </form>
        </details>
      )}
      {message && (
        <p role="status" className="alert alert--info">
          {message}
        </p>
      )}
      {error && (
        <p role="alert">
          {error} <button onClick={refresh}>Coba lagi</button>
        </p>
      )}
      {!data && !error && <p role="status">Memuat pengajuan…</p>}
      {data?.items.length === 0 && <p className="panel">Belum ada pengajuan pada daftar ini.</p>}
      {data?.items.map((ticket) => (
        <TicketCard
          key={`${ticket._id}-${ticket.revision}`}
          ticket={ticket}
          admin={admin}
          refresh={refresh}
        />
      ))}
      {data && <PageControls page={page} totalPages={data.totalPages} onChange={setPage} />}
    </div>
  );
}
function TicketCard({ ticket, admin, refresh }: { ticket: Ticket; admin: boolean; refresh: () => void }) {
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('in_progress');
  const [priority, setPriority] = useState(ticket.priority);
  const [dueAt, setDueAt] = useState(localInput(ticket.dueAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const finance = user?.role === 'super_admin' || user?.role === 'admin_finance';
  return (
    <article className="panel service-ticket">
      <div className="section-heading--split">
        <h2>{ticket.subject}</h2>
        <span className="status status--info">{ticketLabels[ticket.status]}</span>
      </div>
      <p>
        {ticket.number} · {ticketLabels[ticket.kind]} ·{' '}
        <Link to={`${admin ? '/admin' : '/akun'}/pesanan/${ticket.orderNumber}`}>{ticket.orderNumber}</Link>
      </p>
      <p className="muted">
        Penanggung jawab: {ticket.ownerName ?? 'Menunggu penugasan'} · Target tindak lanjut:{' '}
        {formatDate(ticket.dueAt)}
        {!['resolved', 'rejected'].includes(ticket.status) && Date.parse(ticket.dueAt) < Date.now()
          ? ' · Melewati target'
          : ''}
      </p>
      <ol className="timeline">
        {ticket.messages.map((m) => (
          <li key={m._id}>
            <strong>{m.author === 'staff' ? 'Tim Teduh' : m.name}</strong> · <small>{formatDate(m.at)}</small>
            <p className="preserve-lines">{m.body}</p>
            {m.evidenceUrl && (
              <a href={m.evidenceUrl} target="_blank" rel="noreferrer">
                Lihat bukti
              </a>
            )}
          </li>
        ))}
      </ol>
      {!['resolved', 'rejected'].includes(ticket.status) && (
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              if (admin)
                await api.patch(`/experience/admin/tickets/${ticket._id}`, {
                  body,
                  revision: ticket.revision,
                  status,
                  priority,
                  dueAt: isoInput(dueAt),
                });
              else
                await api.post(`/experience/tickets/${ticket._id}/replies`, {
                  body,
                  revision: ticket.revision,
                });
              setBody('');
              refresh();
            } catch (reason) {
              setError(apiErrorMessage(reason));
            } finally {
              setBusy(false);
            }
          }}
        >
          {admin && (
            <div className="experience-fields">
              <label>
                Status berikutnya
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {['in_progress', 'waiting_customer', 'approved', 'resolved', 'rejected']
                    .filter(
                      (s) =>
                        ticket.kind !== 'refund' ||
                        finance ||
                        !['approved', 'resolved', 'rejected'].includes(s),
                    )
                    .map((s) => (
                      <option key={s} value={s}>
                        {ticketLabels[s]}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Prioritas
                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="high">Tinggi</option>
                </select>
              </label>
              <label>
                Target tindak lanjut
                <input
                  type="datetime-local"
                  required
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </label>
            </div>
          )}
          <label>
            {admin ? 'Balasan untuk pembeli / alasan keputusan' : 'Balas tiket'}
            <textarea
              required
              minLength={5}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert">
              {error}{' '}
              <button type="button" onClick={refresh}>
                Muat ulang
              </button>
            </p>
          )}
          <button disabled={busy} className="btn">
            {busy ? 'Menyimpan…' : admin ? 'Ambil tanggung jawab & kirim' : 'Kirim balasan'}
          </button>
        </form>
      )}
    </article>
  );
}
type Inbox = {
  items: Array<{ id: string; at: string; title: string; body: string; href: string; unread: boolean }>;
  unread: number;
  readThrough: string;
};
export function InboxBadge() {
  const { data } = useResource<Inbox>('/inbox', 30000);
  return (
    <Link className="header__action" to="/akun/notifikasi">
      Notifikasi{data?.unread ? ` (${data.unread})` : ''}
    </Link>
  );
}
export function InboxPage() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Memuat sesi…</p>;
  if (!user) return <Navigate to="/masuk?next=%2Fakun%2Fnotifikasi" replace />;
  return <InboxContent />;
}
function InboxContent() {
  const { data, error, refresh } = useResource<Inbox>('/inbox', 15000);
  const [message, setMessage] = useState('');
  return (
    <div className="container page page--narrow">
      <Seo title="Notifikasi — Teduh" noIndex />
      <h1>Notifikasi pesanan</h1>
      <p className="muted">50 pembaruan terbaru. Diperbarui otomatis selama halaman terbuka.</p>
      <button
        className="btn btn--secondary"
        disabled={!data?.unread}
        onClick={async () => {
          try {
            await api.post('/experience/inbox/read', { through: data!.readThrough });
            refresh();
          } catch (e) {
            setMessage(apiErrorMessage(e));
          }
        }}
      >
        Tandai telah dibaca
      </button>
      {(error || message) && <p role="alert">{error || message}</p>}
      {data?.items.length === 0 && <p>Belum ada pembaruan pesanan.</p>}
      {data?.items.map((n) => (
        <article key={n.id} className={`panel inbox-item ${n.unread ? 'is-unread' : ''}`}>
          <small>
            {formatDate(n.at)}
            {n.unread ? ' · Baru' : ''}
          </small>
          <h2>
            <Link to={n.href}>{n.title}</Link>
          </h2>
          <p>{n.body}</p>
        </article>
      ))}
    </div>
  );
}
