import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AdminPageHead, canManage } from './AdminLayout';
import { Seo } from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/StoreContext';
import { api, apiErrorMessage, formatDate, formatRupiah } from '../lib/api';
import type { Category, ProductImage } from '../lib/types';

type AdminListItem = {
  id: string;
  name: string;
  slug: string;
  category: Category;
  status: 'draft' | 'published' | 'archived';
  updatedAt: string;
  variants: Array<{
    sku: string;
    label: string;
    price: number;
    physical: number;
    held: number;
    allocated: number;
    available: number;
  }>;
};

type AdminList = { items: AdminListItem[]; total: number; page: number; totalPages: number };

type AdminVariant = {
  id: string;
  sku: string;
  label: string;
  price: number;
  shippingClass: Category;
  attributes: Record<string, string | number>;
  images: ProductImage[];
  inventory: { physical: number; held: number; allocated: number; available: number } | null;
};

type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  category: Category;
  summary: string;
  description: string;
  care: string;
  images: ProductImage[];
  status: 'draft' | 'published' | 'archived';
  variants: AdminVariant[];
};

const CATEGORY_LABELS: Record<Category, string> = { kasur: 'Kasur', bantal: 'Bantal', furnitur: 'Furnitur' };

export function AdminProductsPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [data, setData] = useState<AdminList | null>(null);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (appliedQ) params.set('q', appliedQ);
    if (status) params.set('status', status);
    api
      .get<AdminList>(`/admin/products${params.toString() ? `?${params}` : ''}`)
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
  }, [appliedQ, status, refresh]);

  if (!user) return null;

  const changeStatus = async (product: AdminListItem, action: 'publish' | 'archive') => {
    if (action === 'archive' && !window.confirm(`Arsipkan ${product.name}? Produk tidak akan tampil di katalog.`)) {
      return;
    }
    try {
      await api.post(`/admin/products/${product.id}/${action}`);
      notify(action === 'publish' ? 'Produk diterbitkan.' : 'Produk diarsipkan.');
      setRefresh((value) => value + 1);
    } catch (reason) {
      notify(apiErrorMessage(reason), 'error');
    }
  };

  return (
    <>
      <Seo title="Produk admin — Teduh" noIndex />
      <AdminPageHead
        eyebrow="Katalog"
        title="Produk dan varian"
        lead="Produk draf dan arsip tidak tampil di katalog. Publikasi memerlukan foto dengan alt text, deskripsi, dan minimal satu varian."
        actions={
          canManage(user, 'catalog') ? (
            <Link to="/admin/produk/baru" className="btn btn--small">
              Produk baru
            </Link>
          ) : null
        }
      />
      <div className="admin-toolbar">
        <form
          className="admin-search"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedQ(q.trim());
          }}
        >
          <label className="sr-only" htmlFor="admin-product-search">
            Cari produk
          </label>
          <input
            id="admin-product-search"
            type="search"
            placeholder="Cari nama atau slug"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <button type="submit" className="btn btn--small btn--secondary">
            Cari
          </button>
        </form>
        <div className="field field--inline">
          <label htmlFor="admin-product-status">Status</label>
          <select id="admin-product-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Semua</option>
            <option value="published">Terbit</option>
            <option value="draft">Draf</option>
            <option value="archived">Arsip</option>
          </select>
        </div>
      </div>
      {error ? <div className="alert alert--error">{error}</div> : null}
      {loading ? (
        <p role="status">Memuat produk…</p>
      ) : !data || data.items.length === 0 ? (
        <div className="admin-empty">Tidak ada produk yang cocok.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">Daftar produk</caption>
            <thead>
              <tr>
                <th scope="col">Produk</th>
                <th scope="col">Status</th>
                <th scope="col">Varian</th>
                <th scope="col">Stok tersedia</th>
                <th scope="col">Diperbarui</th>
                <th scope="col">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((product) => {
                const available = product.variants.reduce((sum, variant) => sum + variant.available, 0);
                return (
                  <tr key={product.id}>
                    <td>
                      <strong>{product.name}</strong>
                      <span className="muted"> /{product.slug}</span>
                      <span className="muted"> · {CATEGORY_LABELS[product.category]}</span>
                    </td>
                    <td>
                      <span className={`status status--${product.status === 'published' ? 'success' : 'neutral'}`}>
                        {product.status}
                      </span>
                    </td>
                    <td>{product.variants.length}</td>
                    <td>{available}</td>
                    <td>{formatDate(product.updatedAt)}</td>
                    <td className="data-table__actions">
                      <Link to={`/admin/produk/${product.id}`} className="link-button">
                        Kelola
                      </Link>
                      {product.status !== 'published' ? (
                        <button type="button" className="link-button" onClick={() => void changeStatus(product, 'publish')}>
                          Terbitkan
                        </button>
                      ) : (
                        <button type="button" className="link-button" onClick={() => void changeStatus(product, 'archive')}>
                          Arsipkan
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const emptyImage: ProductImage = { url: '', alt: '' };
const initialVariant = {
  sku: '',
  label: '',
  price: '',
  shippingClass: 'kasur' as Category,
  physicalStock: '0',
  size: '',
  firmness: '',
  thicknessCm: '',
  fill: '',
  heightCm: '',
  material: '',
  finish: '',
  widthCm: '',
  depthCm: '',
};

type VariantDraft = typeof initialVariant;

function attributesFromDraft(category: Category, draft: VariantDraft): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};
  if (category === 'kasur') {
    if (draft.size.trim()) attributes.size = draft.size.trim();
    if (draft.firmness.trim()) attributes.firmness = draft.firmness.trim();
    if (draft.thicknessCm) attributes.thicknessCm = Number(draft.thicknessCm);
  } else if (category === 'bantal') {
    if (draft.size.trim()) attributes.size = draft.size.trim();
    if (draft.fill.trim()) attributes.fill = draft.fill.trim();
    if (draft.heightCm) attributes.heightCm = Number(draft.heightCm);
  } else {
    if (draft.material.trim()) attributes.material = draft.material.trim();
    if (draft.finish.trim()) attributes.finish = draft.finish.trim();
    if (draft.widthCm) attributes.widthCm = Number(draft.widthCm);
    if (draft.depthCm) attributes.depthCm = Number(draft.depthCm);
    if (draft.heightCm) attributes.heightCm = Number(draft.heightCm);
  }
  return attributes;
}

export function AdminProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'baru';
  const { notify } = useToast();
  const navigate = useNavigate();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [meta, setMeta] = useState({
    name: '',
    slug: '',
    category: 'kasur' as Category,
    summary: '',
    description: '',
    care: '',
  });
  const [images, setImages] = useState<ProductImage[]>([emptyImage]);
  const [variantDraft, setVariantDraft] = useState<VariantDraft>(initialVariant);
  const [newVariant, setNewVariant] = useState<VariantDraft>(initialVariant);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  const loadProduct = async () => {
    if (!id || isNew) return;
    setLoading(true);
    try {
      const response = await api.get<{ product: AdminProduct }>(`/admin/products/${id}`);
      setProduct(response.product);
      setMeta({
        name: response.product.name,
        slug: response.product.slug,
        category: response.product.category,
        summary: response.product.summary,
        description: response.product.description,
        care: response.product.care,
      });
      setImages(response.product.images.length ? response.product.images : [emptyImage]);
      setNewVariant({ ...initialVariant, shippingClass: response.product.category });
      setError(null);
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveMeta = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        if (!variantDraft.sku || !variantDraft.label || !variantDraft.price) {
          throw new Error('SKU, label varian, dan harga awal wajib diisi.');
        }
        const response = await api.post<{ productId: string }>('/admin/products', {
          name: meta.name.trim(),
          slug: meta.slug.trim(),
          category: meta.category,
          summary: meta.summary.trim(),
          description: meta.description.trim(),
          ...(meta.care.trim() ? { care: meta.care.trim() } : {}),
          images: images.filter((image) => image.url.trim() && image.alt.trim()),
          variants: [
            {
              sku: variantDraft.sku.trim().toUpperCase(),
              label: variantDraft.label.trim(),
              price: Number(variantDraft.price),
              shippingClass: variantDraft.shippingClass,
              attributes: attributesFromDraft(meta.category, variantDraft),
              physicalStock: Number(variantDraft.physicalStock || 0),
            },
          ],
        });
        notify('Produk dibuat sebagai draf. Lengkapi lalu terbitkan.');
        navigate(`/admin/produk/${response.productId}`, { replace: true });
      } else if (product) {
        await api.patch(`/admin/products/${product.id}`, {
          name: meta.name.trim(),
          summary: meta.summary.trim(),
          description: meta.description.trim(),
          ...(meta.care.trim() ? { care: meta.care.trim() } : {}),
          images: images.filter((image) => image.url.trim() && image.alt.trim()),
        });
        notify('Detail produk disimpan.');
        await loadProduct();
      }
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const addVariant = async (event: FormEvent) => {
    event.preventDefault();
    if (!product) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/products/${product.id}/variants`, {
        sku: newVariant.sku.trim().toUpperCase(),
        label: newVariant.label.trim(),
        price: Number(newVariant.price),
        shippingClass: newVariant.shippingClass,
        attributes: attributesFromDraft(product.category, newVariant),
        physicalStock: Number(newVariant.physicalStock || 0),
      });
      notify('Varian ditambahkan.');
      setNewVariant({ ...initialVariant, shippingClass: product.category });
      await loadProduct();
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const updateVariant = async (variant: AdminVariant, changes: { label: string; price: string; shippingClass: Category }) => {
    if (!product) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/admin/products/${product.id}/variants/${encodeURIComponent(variant.sku)}`, {
        label: changes.label.trim(),
        price: Number(changes.price),
        shippingClass: changes.shippingClass,
      });
      notify(`Varian ${variant.sku} diperbarui.`);
      await loadProduct();
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const removeVariant = async (variant: AdminVariant) => {
    if (!product) return;
    if (!window.confirm(`Hapus varian ${variant.sku}?`)) return;
    try {
      await api.delete(`/admin/products/${product.id}/variants/${encodeURIComponent(variant.sku)}`);
      notify('Varian dihapus.');
      await loadProduct();
    } catch (reason) {
      notify(apiErrorMessage(reason), 'error');
    }
  };

  const changePublication = async (action: 'publish' | 'archive') => {
    if (!product) return;
    try {
      await api.post(`/admin/products/${product.id}/${action}`);
      notify(action === 'publish' ? 'Produk diterbitkan.' : 'Produk diarsipkan.');
      await loadProduct();
    } catch (reason) {
      notify(apiErrorMessage(reason), 'error');
    }
  };

  if (loading) {
    return <p role="status">Memuat produk…</p>;
  }

  return (
    <>
      <Seo title="Editor produk — Teduh" noIndex />
      <AdminPageHead
        eyebrow="Katalog"
        title={isNew ? 'Produk baru' : product?.name ?? 'Editor produk'}
        lead={
          isNew
            ? 'Buat produk sebagai draf. Terbitkan setelah semua data wajib lengkap.'
            : `Status: ${product?.status ?? '—'} · kategori ${meta.category}`
        }
        actions={
          product ? (
            <div className="admin-page-head__actions">
              {product.status !== 'published' ? (
                <button type="button" className="btn btn--small" onClick={() => void changePublication('publish')}>
                  Terbitkan
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--small btn--secondary"
                  onClick={() => void changePublication('archive')}
                >
                  Arsipkan
                </button>
              )}
            </div>
          ) : null
        }
      />
      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}

      <form className="admin-panel" onSubmit={saveMeta}>
        <h2>Detail produk</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ap-name">Nama</label>
            <input
              id="ap-name"
              required
              value={meta.name}
              onChange={(event) => setMeta({ ...meta, name: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="ap-slug">Slug</label>
            <input
              id="ap-slug"
              required
              disabled={!isNew}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              value={meta.slug}
              onChange={(event) => setMeta({ ...meta, slug: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="ap-category">Kategori</label>
            <select
              id="ap-category"
              disabled={!isNew}
              value={meta.category}
              onChange={(event) => {
                const category = event.target.value as Category;
                setMeta({ ...meta, category });
                setVariantDraft((current) => ({ ...current, shippingClass: category }));
                setNewVariant((current) => ({ ...current, shippingClass: category }));
              }}
            >
              <option value="kasur">Kasur</option>
              <option value="bantal">Bantal</option>
              <option value="furnitur">Furnitur</option>
            </select>
          </div>
          <div className="field field--wide">
            <label htmlFor="ap-summary">Ringkasan singkat</label>
            <input
              id="ap-summary"
              required
              maxLength={240}
              value={meta.summary}
              onChange={(event) => setMeta({ ...meta, summary: event.target.value })}
            />
          </div>
          <div className="field field--wide">
            <label htmlFor="ap-description">Deskripsi</label>
            <textarea
              id="ap-description"
              required
              rows={5}
              value={meta.description}
              onChange={(event) => setMeta({ ...meta, description: event.target.value })}
            />
          </div>
          <div className="field field--wide">
            <label htmlFor="ap-care">Perawatan</label>
            <textarea
              id="ap-care"
              rows={3}
              value={meta.care}
              onChange={(event) => setMeta({ ...meta, care: event.target.value })}
            />
          </div>
        </div>

        <h3>Foto</h3>
        <p className="muted">URL relatif seperti /images/products/... atau URL HTTPS. Alt text wajib.</p>
        {images.map((image, index) => (
          <div className="image-row" key={index}>
            <div className="field">
              <label htmlFor={`image-url-${index}`}>URL gambar {index + 1}</label>
              <input
                id={`image-url-${index}`}
                value={image.url}
                onChange={(event) =>
                  setImages((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, url: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            <div className="field">
              <label htmlFor={`image-alt-${index}`}>Alt text {index + 1}</label>
              <input
                id={`image-alt-${index}`}
                value={image.alt}
                onChange={(event) =>
                  setImages((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, alt: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            <button
              type="button"
              className="link-button"
              onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            >
              Hapus
            </button>
          </div>
        ))}
        <button type="button" className="btn btn--small btn--secondary" onClick={() => setImages([...images, emptyImage])}>
          Tambah foto
        </button>

        {isNew ? (
          <>
            <h3>Varian pertama</h3>
            <VariantFields draft={variantDraft} setDraft={setVariantDraft} category={meta.category} idPrefix="new" />
          </>
        ) : null}

        <div className="admin-form-actions">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Menyimpan…' : isNew ? 'Buat produk' : 'Simpan detail'}
          </button>
        </div>
      </form>

      {!isNew && product ? (
        <>
          <section className="admin-panel">
            <h2>Varian</h2>
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">Varian produk</caption>
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Label &amp; harga</th>
                    <th scope="col">Stok</th>
                    <th scope="col">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((variant) => (
                    <VariantRow
                      key={variant.id}
                      variant={variant}
                      saving={saving}
                      onSave={updateVariant}
                      onDelete={removeVariant}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <form className="admin-panel" onSubmit={addVariant}>
            <h2>Tambah varian</h2>
            <VariantFields
              draft={newVariant}
              setDraft={setNewVariant}
              category={product.category}
              idPrefix="add"
            />
            <div className="admin-form-actions">
              <button type="submit" className="btn" disabled={saving}>
                {saving ? 'Menyimpan…' : 'Tambah varian'}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </>
  );
}

function VariantRow({
  variant,
  saving,
  onSave,
  onDelete,
}: {
  variant: AdminVariant;
  saving: boolean;
  onSave: (variant: AdminVariant, changes: { label: string; price: string; shippingClass: Category }) => Promise<void>;
  onDelete: (variant: AdminVariant) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(variant.label);
  const [price, setPrice] = useState(String(variant.price));
  const [shippingClass, setShippingClass] = useState<Category>(variant.shippingClass);

  return (
    <tr>
      <td>
        <strong>{variant.sku}</strong>
      </td>
      <td>
        {editing ? (
          <div className="variant-cell">
            <input aria-label={`Label ${variant.sku}`} value={label} onChange={(event) => setLabel(event.target.value)} />
            <input
              aria-label={`Harga ${variant.sku}`}
              type="number"
              min={0}
              step={1000}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
            <select
              aria-label={`Kelas kirim ${variant.sku}`}
              value={shippingClass}
              onChange={(event) => setShippingClass(event.target.value as Category)}
            >
              <option value="kasur">Kasur</option>
              <option value="bantal">Bantal</option>
              <option value="furnitur">Furnitur</option>
            </select>
          </div>
        ) : (
          <>
            <span>{variant.label}</span>
            <span className="muted"> · {formatRupiah(variant.price)}</span>
          </>
        )}
      </td>
      <td>
        {variant.inventory ? (
          <span>
            {variant.inventory.available} tersedia
            <span className="muted">
              {' '}
              (fisik {variant.inventory.physical}, tahan {variant.inventory.held}, alokasi{' '}
              {variant.inventory.allocated})
            </span>
          </span>
        ) : (
          'Belum ada inventaris'
        )}
      </td>
      <td className="data-table__actions">
        {editing ? (
          <>
            <button
              type="button"
              className="link-button"
              disabled={saving}
              onClick={async () => {
                await onSave(variant, { label, price, shippingClass });
                setEditing(false);
              }}
            >
              Simpan
            </button>
            <button type="button" className="link-button" onClick={() => setEditing(false)}>
              Batal
            </button>
          </>
        ) : (
          <>
            <button type="button" className="link-button" onClick={() => setEditing(true)}>
              Ubah
            </button>
            <button type="button" className="link-button" onClick={() => void onDelete(variant)}>
              Hapus
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function VariantFields({
  draft,
  setDraft,
  category,
  idPrefix,
}: {
  draft: VariantDraft;
  setDraft: (draft: VariantDraft) => void;
  category: Category;
  idPrefix: string;
}) {
  const set = (key: keyof VariantDraft, value: string) => setDraft({ ...draft, [key]: value });
  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor={`${idPrefix}-sku`}>SKU</label>
        <input id={`${idPrefix}-sku`} required value={draft.sku} onChange={(event) => set('sku', event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-label`}>Label varian</label>
        <input id={`${idPrefix}-label`} required value={draft.label} onChange={(event) => set('label', event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-price`}>Harga (Rupiah)</label>
        <input
          id={`${idPrefix}-price`}
          type="number"
          min={0}
          step={1000}
          required
          value={draft.price}
          onChange={(event) => set('price', event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-class`}>Kelas kirim</label>
        <select
          id={`${idPrefix}-class`}
          value={draft.shippingClass}
          onChange={(event) => set('shippingClass', event.target.value)}
        >
          <option value="kasur">Kasur</option>
          <option value="bantal">Bantal</option>
          <option value="furnitur">Furnitur</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-stock`}>Stok fisik awal</label>
        <input
          id={`${idPrefix}-stock`}
          type="number"
          min={0}
          value={draft.physicalStock}
          onChange={(event) => set('physicalStock', event.target.value)}
        />
      </div>
      {category === 'kasur' ? (
        <>
          <div className="field">
            <label htmlFor={`${idPrefix}-size`}>Ukuran</label>
            <input id={`${idPrefix}-size`} placeholder="160 × 200 cm" value={draft.size} onChange={(event) => set('size', event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-firmness`}>Tingkat kekerasan</label>
            <input id={`${idPrefix}-firmness`} placeholder="Sedang" value={draft.firmness} onChange={(event) => set('firmness', event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-thickness`}>Ketebalan (cm)</label>
            <input id={`${idPrefix}-thickness`} type="number" min={0} value={draft.thicknessCm} onChange={(event) => set('thicknessCm', event.target.value)} />
          </div>
        </>
      ) : null}
      {category === 'bantal' ? (
        <>
          <div className="field">
            <label htmlFor={`${idPrefix}-size`}>Ukuran</label>
            <input id={`${idPrefix}-size`} placeholder="50 × 70 cm" value={draft.size} onChange={(event) => set('size', event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-fill`}>Isi</label>
            <input id={`${idPrefix}-fill`} placeholder="Serat poliester" value={draft.fill} onChange={(event) => set('fill', event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-height`}>Tinggi (cm)</label>
            <input id={`${idPrefix}-height`} type="number" min={0} value={draft.heightCm} onChange={(event) => set('heightCm', event.target.value)} />
          </div>
        </>
      ) : null}
      {category === 'furnitur' ? (
        <>
          <div className="field">
            <label htmlFor={`${idPrefix}-material`}>Bahan</label>
            <input id={`${idPrefix}-material`} placeholder="Kayu jati" value={draft.material} onChange={(event) => set('material', event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-finish`}>Finishing</label>
            <input id={`${idPrefix}-finish`} placeholder="Minyak alami" value={draft.finish} onChange={(event) => set('finish', event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-width`}>Lebar (cm)</label>
            <input id={`${idPrefix}-width`} type="number" min={0} value={draft.widthCm} onChange={(event) => set('widthCm', event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-depth`}>Kedalaman (cm)</label>
            <input id={`${idPrefix}-depth`} type="number" min={0} value={draft.depthCm} onChange={(event) => set('depthCm', event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-height`}>Tinggi (cm)</label>
            <input id={`${idPrefix}-height`} type="number" min={0} value={draft.heightCm} onChange={(event) => set('heightCm', event.target.value)} />
          </div>
        </>
      ) : null}
    </div>
  );
}
