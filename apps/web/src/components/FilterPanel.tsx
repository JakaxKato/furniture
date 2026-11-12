import { useEffect, useId, useState } from 'react';
import { formatRupiah } from '../lib/api';
import type { Category, FacetsResponse } from '../lib/types';

export type FilterValues = {
  q?: string;
  category?: Category;
  minPrice?: string;
  maxPrice?: string;
  inStock?: boolean;
  size?: string;
  firmness?: string;
  thickness?: string;
  fill?: string;
  height?: string;
  material?: string;
  finish?: string;
  maxWidth?: string;
};

type FilterPatch = Partial<FilterValues>;

const CATEGORY_LABELS: Record<Category, string> = {
  kasur: 'Kasur',
  bantal: 'Bantal',
  furnitur: 'Furnitur',
};

export function FilterPanel({
  facets,
  values,
  onChange,
  onClear,
  hideHeading = false,
}: {
  facets: FacetsResponse | null;
  values: FilterValues;
  onChange: (patch: FilterPatch) => void;
  onClear: () => void;
  hideHeading?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState(values.q ?? '');
  const [minPrice, setMinPrice] = useState(values.minPrice ?? '');
  const [maxPrice, setMaxPrice] = useState(values.maxPrice ?? '');
  const [priceError, setPriceError] = useState<string | null>(null);

  useEffect(() => setQ(values.q ?? ''), [values.q]);
  useEffect(() => setMinPrice(values.minPrice ?? ''), [values.minPrice]);
  useEffect(() => setMaxPrice(values.maxPrice ?? ''), [values.maxPrice]);

  const category = values.category;
  const specific = category && facets ? facets.filters[category] : null;

  return (
    <div className="filters" aria-label="Filter katalog">
      {!hideHeading ? (
        <div className="filters__head">
          <h2>Filter</h2>
          <button type="button" className="link-button" onClick={onClear}>
            Hapus semua
          </button>
        </div>
      ) : (
        <div className="filters__head filters__head--compact">
          <span className="muted">Pilih atribut yang sesuai.</span>
          <button type="button" className="link-button" onClick={onClear}>
            Hapus semua
          </button>
        </div>
      )}

      <form
        className="filter-group"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onChange({ q: q.trim() || undefined });
        }}
      >
        <label htmlFor={`${id}-search`} className="field-label">
          Cari produk
        </label>
        <div className="search-row">
          <input
            id={`${id}-search`}
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Misalnya: linen"
            autoComplete="off"
          />
          <button type="submit" className="btn btn--small btn--secondary">
            Cari
          </button>
        </div>
      </form>

      <fieldset className="filter-group">
        <legend className="field-label">Kategori</legend>
        <div className="radio-list">
          <label className="radio-row">
            <input
              type="radio"
              name={`${id}-category`}
              checked={!category}
              onChange={() => onChange({ category: undefined })}
            />
            <span>Semua</span>
          </label>
          {(facets?.categories ?? (Object.keys(CATEGORY_LABELS) as Category[]).map((value) => ({ value, label: CATEGORY_LABELS[value] }))).map(
            (item) => (
              <label className="radio-row" key={item.value}>
                <input
                  type="radio"
                  name={`${id}-category`}
                  checked={category === item.value}
                  onChange={() => onChange({ category: item.value })}
                />
                <span>{item.label}</span>
              </label>
            ),
          )}
        </div>
      </fieldset>

      <fieldset className="filter-group">
        <legend className="field-label">Harga (Rupiah)</legend>
        <div className="price-row">
          <label className="sr-only" htmlFor={`${id}-min`}>
            Harga minimum
          </label>
          <input
            id={`${id}-min`}
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            placeholder="Minimum"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
          />
          <span aria-hidden="true">–</span>
          <label className="sr-only" htmlFor={`${id}-max`}>
            Harga maksimum
          </label>
          <input
            id={`${id}-max`}
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            placeholder="Maksimum"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
          />
        </div>
        {priceError ? (
          <p className="field-error" role="alert">
            {priceError}
          </p>
        ) : null}
        <button
          type="button"
          className="btn btn--small btn--secondary"
          onClick={() => {
            const min = minPrice ? Number(minPrice) : undefined;
            const max = maxPrice ? Number(maxPrice) : undefined;
            if (min !== undefined && max !== undefined && min > max) {
              setPriceError('Harga minimum tidak boleh melebihi maksimum.');
              return;
            }
            setPriceError(null);
            onChange({
              minPrice: min !== undefined ? String(Math.max(0, Math.trunc(min))) : undefined,
              maxPrice: max !== undefined ? String(Math.max(0, Math.trunc(max))) : undefined,
            });
          }}
        >
          Terapkan harga
        </button>
        {facets?.priceRange ? (
          <p className="field-hint">
            Rentang katalog {formatRupiah(facets.priceRange.min)}–{formatRupiah(facets.priceRange.max)}
          </p>
        ) : null}
      </fieldset>

      <label className="checkbox-row filter-group">
        <input
          type="checkbox"
          checked={Boolean(values.inStock)}
          onChange={(event) => onChange({ inStock: event.target.checked || undefined })}
        />
        <span>Hanya yang tersedia</span>
      </label>

      {category && specific ? (
        <div className="filter-group filter-group--specific">
          <p className="field-label">
            Filter {CATEGORY_LABELS[category]}
          </p>
          {category === 'kasur' ? (
            <>
              <SelectFilter
                id={`${id}-size`}
                label="Ukuran"
                value={values.size}
                options={specific.size}
                emptyLabel="Semua ukuran"
                onChange={(value) => onChange({ size: value })}
              />
              <SelectFilter
                id={`${id}-firmness`}
                label="Tingkat kekerasan"
                value={values.firmness}
                options={specific.firmness}
                emptyLabel="Semua tingkat"
                onChange={(value) => onChange({ firmness: value })}
              />
              <SelectFilter
                id={`${id}-thickness`}
                label="Ketebalan"
                value={values.thickness}
                options={specific.thickness}
                emptyLabel="Semua ketebalan"
                suffix=" cm"
                onChange={(value) => onChange({ thickness: value })}
              />
            </>
          ) : null}
          {category === 'bantal' ? (
            <>
              <SelectFilter
                id={`${id}-fill`}
                label="Isi"
                value={values.fill}
                options={specific.fill}
                emptyLabel="Semua isi"
                onChange={(value) => onChange({ fill: value })}
              />
              <SelectFilter
                id={`${id}-height`}
                label="Tinggi"
                value={values.height}
                options={specific.height}
                emptyLabel="Semua tinggi"
                suffix=" cm"
                onChange={(value) => onChange({ height: value })}
              />
            </>
          ) : null}
          {category === 'furnitur' ? (
            <>
              <SelectFilter
                id={`${id}-material`}
                label="Bahan"
                value={values.material}
                options={specific.material}
                emptyLabel="Semua bahan"
                onChange={(value) => onChange({ material: value })}
              />
              <SelectFilter
                id={`${id}-finish`}
                label="Finishing"
                value={values.finish}
                options={specific.finish}
                emptyLabel="Semua finishing"
                onChange={(value) => onChange({ finish: value })}
              />
              <SelectFilter
                id={`${id}-maxWidth`}
                label="Lebar maksimal"
                value={values.maxWidth}
                options={specific.width}
                emptyLabel="Semua ukuran"
                suffix=" cm"
                optionPrefix="≤ "
                onChange={(value) => onChange({ maxWidth: value })}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SelectFilter({
  id,
  label,
  value,
  options,
  emptyLabel,
  suffix = '',
  optionPrefix = '',
  onChange,
}: {
  id: string;
  label: string;
  value?: string;
  options: Array<string | number>;
  emptyLabel: string;
  suffix?: string;
  optionPrefix?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option value={String(option)} key={String(option)}>
            {optionPrefix}
            {option}
            {suffix}
          </option>
        ))}
      </select>
    </div>
  );
}
