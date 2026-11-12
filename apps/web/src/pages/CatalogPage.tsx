import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dialog } from '../components/Dialog';
import { FilterPanel, type FilterValues } from '../components/FilterPanel';
import { ProductCard } from '../components/ProductCard';
import { Seo } from '../components/Seo';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { api, apiErrorMessage, formatRupiah } from '../lib/api';
import type { Category, FacetsResponse, ProductListResponse } from '../lib/types';

const CATEGORY_VALUES: Category[] = ['kasur', 'bantal', 'furnitur'];
const CATEGORY_LABELS: Record<Category, string> = {
  kasur: 'Kasur',
  bantal: 'Bantal',
  furnitur: 'Furnitur',
};
const FILTER_KEYS = [
  'q',
  'category',
  'minPrice',
  'maxPrice',
  'inStock',
  'size',
  'firmness',
  'thickness',
  'fill',
  'height',
  'material',
  'finish',
  'maxWidth',
] as const;

function readFilters(params: URLSearchParams): FilterValues {
  const categoryValue = params.get('category');
  return {
    q: params.get('q') ?? undefined,
    category:
      categoryValue && CATEGORY_VALUES.includes(categoryValue as Category)
        ? (categoryValue as Category)
        : undefined,
    minPrice: params.get('minPrice') ?? undefined,
    maxPrice: params.get('maxPrice') ?? undefined,
    inStock: params.get('inStock') === 'true' ? true : undefined,
    size: params.get('size') ?? undefined,
    firmness: params.get('firmness') ?? undefined,
    thickness: params.get('thickness') ?? undefined,
    fill: params.get('fill') ?? undefined,
    height: params.get('height') ?? undefined,
    material: params.get('material') ?? undefined,
    finish: params.get('finish') ?? undefined,
    maxWidth: params.get('maxWidth') ?? undefined,
  };
}

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const [facets, setFacets] = useState<FacetsResponse | null>(null);
  const [result, setResult] = useState<ProductListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);

  const filters = useMemo(() => readFilters(params), [params]);
  const sort = params.get('sort') ?? 'terbaru';
  const queryString = params.toString();
  const activeCount = FILTER_KEYS.filter((key) => params.get(key)).length;

  useEffect(() => {
    let cancelled = false;
    api
      .get<FacetsResponse>('/products/facets')
      .then((data) => {
        if (!cancelled) setFacets(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .get<ProductListResponse>(`/products${queryString ? `?${queryString}` : ''}`)
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(apiErrorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [queryString, retry]);

  const patch = (next: Record<string, string | undefined>) => {
    const updated = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '') updated.delete(key);
      else updated.set(key, value);
    }
    if (!('page' in next)) updated.delete('page');
    setParams(updated, { replace: false });
  };

  const applyFilters = (next: Partial<FilterValues>) => {
    const mapped: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(next)) {
      mapped[key] = value === undefined || value === null ? undefined : String(value);
    }
    if ('category' in next && next.category !== filters.category) {
      for (const key of ['size', 'firmness', 'thickness', 'fill', 'height', 'material', 'finish', 'maxWidth']) {
        mapped[key] = undefined;
      }
    }
    patch(mapped);
  };

  const clearFilters = () => {
    const updated = new URLSearchParams();
    const currentSort = params.get('sort');
    if (currentSort) updated.set('sort', currentSort);
    setParams(updated, { replace: false });
  };

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string }> = [];
    if (filters.q) chips.push({ key: 'q', label: `Cari: ${filters.q}` });
    if (filters.category) chips.push({ key: 'category', label: `Kategori: ${CATEGORY_LABELS[filters.category]}` });
    if (filters.minPrice || filters.maxPrice) {
      chips.push({
        key: 'price',
        label: `Harga: ${filters.minPrice ? formatRupiah(Number(filters.minPrice)) : 'bebas'}–${
          filters.maxPrice ? formatRupiah(Number(filters.maxPrice)) : 'bebas'
        }`,
      });
    }
    if (filters.inStock) chips.push({ key: 'inStock', label: 'Hanya tersedia' });
    const labels: Record<string, string> = {
      size: 'Ukuran',
      firmness: 'Kekerasan',
      thickness: 'Ketebalan',
      fill: 'Isi',
      height: 'Tinggi',
      material: 'Bahan',
      finish: 'Finishing',
      maxWidth: 'Lebar maksimal',
    };
    for (const key of ['size', 'firmness', 'thickness', 'fill', 'height', 'material', 'finish', 'maxWidth']) {
      const value = filters[key as keyof FilterValues];
      if (value) {
        const suffix = ['thickness', 'height', 'maxWidth'].includes(key) ? ' cm' : '';
        chips.push({ key, label: `${labels[key]}: ${value}${suffix}` });
      }
    }
    return chips;
  }, [filters]);

  const removeChip = (key: string) => {
    if (key === 'price') patch({ minPrice: undefined, maxPrice: undefined });
    else patch({ [key]: undefined });
  };

  return (
    <>
      <Seo
        title="Katalog — Teduh"
        description="Cari kasur, bantal, dan furnitur berdasarkan ukuran, bahan, harga, dan ketersediaan. Setiap produk memiliki dimensi sentimeter dan harga per varian."
        canonicalPath="/katalog"
      />
      <header className="catalog-hero">
        <div className="container">
          <p className="eyebrow">Semua produk</p>
          <h1>Katalog</h1>
          <p className="catalog-hero__lead">
            Kasur, bantal, dan furnitur dengan ukuran, bahan, serta ketersediaan per varian.
            Pilih filter untuk mempersempit hasil.
          </p>
        </div>
      </header>

      <div className="container shop-layout">
        <aside className="shop-sidebar" aria-label="Filter katalog">
          <FilterPanel facets={facets} values={filters} onChange={applyFilters} onClear={clearFilters} />
        </aside>

        <section className="shop-main" aria-label="Hasil katalog">
          <div className="shop-toolbar">
            <div className="shop-toolbar__count">
              <p role="status" aria-live="polite">
                {loading ? 'Memuat produk…' : `${result?.total ?? 0} produk`}
              </p>
              <button
                type="button"
                className="btn btn--small btn--secondary filter-toggle"
                onClick={() => setFilterOpen(true)}
                aria-haspopup="dialog"
              >
                Filter{activeCount > 0 ? ` (${activeCount})` : ''}
              </button>
            </div>
            <div className="field field--inline">
              <label htmlFor="sort">Urutkan</label>
              <select
                id="sort"
                value={sort}
                onChange={(event) => patch({ sort: event.target.value, page: undefined })}
              >
                <option value="terbaru">Terbaru</option>
                <option value="harga_asc">Harga terendah</option>
                <option value="harga_desc">Harga tertinggi</option>
                <option value="nama">Nama A–Z</option>
              </select>
            </div>
          </div>

          {activeChips.length > 0 ? (
            <div className="active-filters" aria-label="Filter aktif">
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="filter-chip"
                  onClick={() => removeChip(chip.key)}
                  aria-label={`Hapus filter ${chip.label}`}
                >
                  {chip.label} <span aria-hidden="true">×</span>
                </button>
              ))}
              <button type="button" className="link-button" onClick={clearFilters}>
                Hapus semua
              </button>
            </div>
          ) : null}

          {error ? (
            <ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} />
          ) : loading ? (
            <LoadingState label="Memuat katalog" cards={6} />
          ) : !result || result.items.length === 0 ? (
            <EmptyState
              title="Tidak ada produk yang cocok"
              message="Coba hapus beberapa filter atau gunakan kata pencarian yang lebih umum."
            >
              <button type="button" className="btn" onClick={clearFilters}>
                Hapus semua filter
              </button>
            </EmptyState>
          ) : (
            <>
              <div className="product-grid">
                {result.items.map((product, index) => (
                  <ProductCard product={product} key={product.id} eager={index < 3} />
                ))}
              </div>
              <Pagination
                page={result.page}
                totalPages={result.totalPages}
                onChange={(nextPage) => patch({ page: String(nextPage) })}
              />
            </>
          )}
        </section>
      </div>

      <Dialog open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter katalog">
        <FilterPanel
          facets={facets}
          values={filters}
          onChange={applyFilters}
          onClear={clearFilters}
          hideHeading
        />
        <div className="dialog__footer">
          <button type="button" className="btn" onClick={() => setFilterOpen(false)}>
            Lihat {result?.total ?? 0} produk
          </button>
        </div>
      </Dialog>
    </>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }).map((_, index) => index + 1);
  const visible = pages.filter(
    (item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1,
  );
  const items: Array<number | 'gap'> = [];
  visible.forEach((item, index) => {
    if (index > 0 && item - visible[index - 1]! > 1) items.push('gap');
    items.push(item);
  });
  return (
    <nav className="pagination" aria-label="Halaman katalog">
      <button
        type="button"
        className="pagination__btn"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        Sebelumnya
      </button>
      {items.map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className="pagination__gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`pagination__btn ${item === page ? 'is-active' : ''}`}
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
            aria-label={`Halaman ${item}`}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className="pagination__btn"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
      >
        Berikutnya
      </button>
    </nav>
  );
}
