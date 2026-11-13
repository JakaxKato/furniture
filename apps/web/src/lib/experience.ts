import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage } from './api';

export function useResource<T>(path: string, interval = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .get<T>(`/experience${path}`)
        .then((value) => {
          if (active) {
            setData(value);
            setError('');
          }
        })
        .catch((reason) => {
          if (active) setError(apiErrorMessage(reason));
        });
    void load();
    const timer = interval
      ? window.setInterval(() => {
          if (!document.hidden) void load();
        }, interval)
      : undefined;
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [path, version, interval]);
  return { data, error, refresh };
}
export type Paged<T> = { items: T[]; page: number; total: number; totalPages: number };
export type Ticket = {
  _id: string;
  number: string;
  orderNumber: string;
  kind: string;
  subject: string;
  status: string;
  priority: string;
  ownerName?: string;
  dueAt: string;
  revision: number;
  messages: Array<{
    _id: string;
    author: string;
    name: string;
    body: string;
    evidenceUrl?: string;
    at: string;
  }>;
};
export const ticketLabels: Record<string, string> = {
  open: 'Menunggu tanggapan',
  in_progress: 'Ditangani',
  waiting_customer: 'Menunggu balasan Anda',
  approved: 'Disetujui untuk diproses',
  resolved: 'Selesai',
  rejected: 'Ditolak',
  help: 'Bantuan',
  shipping: 'Pengiriman',
  return: 'Retur',
  refund: 'Refund',
};
export const localInput = (value?: string | null) =>
  value
    ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16)
    : '';
export const isoInput = (value: string) => (value ? new Date(value).toISOString() : null);
