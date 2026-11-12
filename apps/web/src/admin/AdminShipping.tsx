import { useEffect, useState } from 'react';
import { AdminPageHead } from './AdminLayout';
import { Seo } from '../components/Seo';
import { useToast } from '../context/StoreContext';
import { api, apiErrorMessage, formatDate } from '../lib/api';
import type { Category } from '../lib/types';

type Rate = {
  shippingClass: Category;
  label: string;
  price: number;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  etaConfirmed: boolean;
};

type Zone = {
  id: string;
  code: string;
  name: string;
  province: string;
  cities: string[];
  postalPrefixes: string[];
  rates: Rate[];
  version: number;
  active: boolean;
  updatedAt: string;
};

type DraftRate = {
  shippingClass: Category;
  price: string;
  etaMinDays: string;
  etaMaxDays: string;
  etaConfirmed: boolean;
};

const CLASSES: Category[] = ['kasur', 'bantal', 'furnitur'];
const CLASS_LABELS: Record<Category, string> = { kasur: 'Kasur', bantal: 'Bantal', furnitur: 'Furnitur' };

export function AdminShippingPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setLoading(true);
    api
      .get<{ items: Zone[] }>('/admin/shipping-zones')
      .then((data) => {
        setZones(data.items);
        setError(null);
      })
      .catch((reason) => setError(apiErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, [refresh]);

  return (
    <>
      <Seo title="Zona dan tarif — Teduh" noIndex />
      <AdminPageHead
        eyebrow="Pengiriman"
        title="Zona dan tarif"
        lead="Tarif disimpan per kelas kirim dan zona. Setiap penyimpanan menaikkan versi aturan; pesanan menyimpan versi yang dipakai."
      />
      {error ? <div className="alert alert--error">{error}</div> : null}
      <AddZoneForm onCreated={() => setRefresh((value) => value + 1)} />
      {loading ? (
        <p role="status">Memuat zona…</p>
      ) : (
        <div className="zone-list">
          {zones.map((zone) => (
            <ZoneEditor
              key={`${zone.id}-${zone.version}`}
              zone={zone}
              onSaved={() => setRefresh((value) => value + 1)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AddZoneForm({ onCreated }: { onCreated: () => void }) {
  const { notify } = useToast();
  const [form, setForm] = useState({ code: '', name: '', province: '', cities: '', postalPrefixes: '' });
  const [saving, setSaving] = useState(false);

  return (
    <details className="admin-panel">
      <summary className="admin-details__summary">Tambah zona baru</summary>
      <p className="muted">
        Zona baru dibuat tidak aktif. Tambahkan tarif per kelas terlebih dahulu, lalu aktifkan.
      </p>
      <form
        className="form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await api.post('/admin/shipping-zones', {
              code: form.code.trim().toUpperCase(),
              name: form.name.trim(),
              province: form.province.trim(),
              cities: form.cities
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
              postalPrefixes: form.postalPrefixes
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            });
            notify('Zona dibuat. Lengkapi tarif lalu aktifkan.');
            setForm({ code: '', name: '', province: '', cities: '', postalPrefixes: '' });
            onCreated();
          } catch (reason) {
            notify(apiErrorMessage(reason), 'error');
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="zone-name">Nama zona</label>
          <input
            id="zone-name"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="zone-code">Kode</label>
          <input
            id="zone-code"
            required
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="zone-province">Provinsi</label>
          <input
            id="zone-province"
            required
            value={form.province}
            onChange={(event) => setForm({ ...form, province: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="zone-cities">Kota (pisahkan koma)</label>
          <input
            id="zone-cities"
            required
            value={form.cities}
            onChange={(event) => setForm({ ...form, cities: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="zone-prefixes">Prefiks kode pos (pisahkan koma)</label>
          <input
            id="zone-prefixes"
            required
            value={form.postalPrefixes}
            onChange={(event) => setForm({ ...form, postalPrefixes: event.target.value })}
          />
        </div>
        <div className="field field--wide">
          <button type="submit" className="btn btn--small btn--secondary" disabled={saving}>
            {saving ? 'Menyimpan…' : 'Tambah zona'}
          </button>
        </div>
      </form>
    </details>
  );
}

function ZoneEditor({ zone, onSaved }: { zone: Zone; onSaved: () => void }) {
  const { notify } = useToast();
  const [active, setActive] = useState(zone.active);
  const [draft, setDraft] = useState<Record<Category, DraftRate>>(() =>
    Object.fromEntries(
      CLASSES.map((shippingClass) => {
        const existing = zone.rates.find((rate) => rate.shippingClass === shippingClass);
        return [
          shippingClass,
          {
            shippingClass,
            price: existing ? String(existing.price) : '',
            etaMinDays: existing?.etaMinDays !== null && existing?.etaMinDays !== undefined ? String(existing.etaMinDays) : '',
            etaMaxDays: existing?.etaMaxDays !== null && existing?.etaMaxDays !== undefined ? String(existing.etaMaxDays) : '',
            etaConfirmed: existing?.etaConfirmed ?? false,
          },
        ];
      }),
    ) as Record<Category, DraftRate>,
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const rates = CLASSES.filter((shippingClass) => draft[shippingClass].price !== '').map((shippingClass) => {
        const row = draft[shippingClass];
        return {
          shippingClass,
          price: Number(row.price),
          ...(row.etaMinDays !== '' ? { etaMinDays: Number(row.etaMinDays) } : {}),
          ...(row.etaMaxDays !== '' ? { etaMaxDays: Number(row.etaMaxDays) } : {}),
          etaConfirmed: row.etaConfirmed,
        };
      });
      await api.patch(`/admin/shipping-zones/${zone.id}`, { rates, active });
      notify(`Zona ${zone.name} disimpan.`);
      onSaved();
    } catch (reason) {
      notify(apiErrorMessage(reason), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-panel zone-card" aria-labelledby={`zone-${zone.code}`}>
      <div className="zone-card__head">
        <div>
          <h2 id={`zone-${zone.code}`}>
            {zone.name} <span className="muted">({zone.code})</span>
          </h2>
          <p className="muted">
            {zone.province} · kota: {zone.cities.join(', ')} · prefiks pos: {zone.postalPrefixes.join(', ')}
          </p>
          <p className="muted">
            Versi {zone.version} · diperbarui {formatDate(zone.updatedAt)}
          </p>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          <span>Aktif</span>
        </label>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <caption className="sr-only">Tarif zona {zone.name}</caption>
          <thead>
            <tr>
              <th scope="col">Kelas</th>
              <th scope="col">Tarif (Rp)</th>
              <th scope="col">Estimasi min (hari)</th>
              <th scope="col">Estimasi maks (hari)</th>
              <th scope="col">Estimasi terkonfirmasi</th>
            </tr>
          </thead>
          <tbody>
            {CLASSES.map((shippingClass) => (
              <tr key={shippingClass}>
                <th scope="row">{CLASS_LABELS[shippingClass]}</th>
                <td>
                  <input
                    aria-label={`Tarif ${CLASS_LABELS[shippingClass]} ${zone.name}`}
                    type="number"
                    min={0}
                    step={1000}
                    value={draft[shippingClass].price}
                    placeholder="Belum ada"
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [shippingClass]: { ...draft[shippingClass], price: event.target.value },
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`Estimasi minimum ${CLASS_LABELS[shippingClass]} ${zone.name}`}
                    type="number"
                    min={0}
                    value={draft[shippingClass].etaMinDays}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [shippingClass]: { ...draft[shippingClass], etaMinDays: event.target.value },
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`Estimasi maksimum ${CLASS_LABELS[shippingClass]} ${zone.name}`}
                    type="number"
                    min={0}
                    value={draft[shippingClass].etaMaxDays}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [shippingClass]: { ...draft[shippingClass], etaMaxDays: event.target.value },
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`Estimasi terkonfirmasi ${CLASS_LABELS[shippingClass]} ${zone.name}`}
                    type="checkbox"
                    checked={draft[shippingClass].etaConfirmed}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [shippingClass]: { ...draft[shippingClass], etaConfirmed: event.target.checked },
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="zone-card__foot">
        <p className="muted">
          Kosongkan tarif jika kelas ini belum dilayani di zona. Pembayaran pelanggan akan diblokir
          untuk kombinasi yang tarifnya tidak lengkap.
        </p>
        <button type="button" className="btn btn--small" onClick={() => void save()} disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan zona'}
        </button>
      </div>
    </section>
  );
}
