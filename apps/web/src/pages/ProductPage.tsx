import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import { Seo } from '../components/Seo';
import { ErrorState, LoadingState } from '../components/States';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { useToast } from '../context/StoreContext';
import {
  api,
  apiErrorMessage,
  attributeLabel,
  attributeValue,
  formatRupiah,
  track,
} from '../lib/api';
import type { ProductDetail, ProductListResponse } from '../lib/types';

export function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [related, setRelated] = useState<ProductListResponse | null>(null);
  const { add } = useCart();
  const { notify } = useToast();
  const { store } = useStore();

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setSelectedId(null);
    setActiveImage(0);
    api
      .get<ProductDetail>(`/products/${encodeURIComponent(slug)}`)
      .then((data) => {
        if (!cancelled) {
          setProduct(data);
          track('view_product', { productId: data.id });
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          const message = apiErrorMessage(reason);
          const code = (reason as { code?: string }).code;
          if (code === 'PRODUCT_NOT_FOUND') setNotFound(true);
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, retry]);

  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    api
      .get<ProductListResponse>(`/products?category=${product.category}&perPage=4`)
      .then((data) => {
        if (!cancelled) {
          setRelated({
            ...data,
            items: data.items.filter((item) => item.slug !== product.slug).slice(0, 3),
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [product]);

  const selected = product?.variants.find((variant) => variant.id === selectedId) ?? null;
  const gallery = selected?.images.length ? selected.images : (product?.images ?? []);
  const currentImage = gallery[Math.min(activeImage, GalleryLast(gallery))];

  useEffect(() => {
    setActiveImage(0);
  }, [selectedId]);

  if (loading) {
    return (
      <div className="container page">
        <LoadingState label="Memuat produk" />
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="container page">
        <ErrorState
          title="Produk tidak ditemukan"
          message="Produk mungkin sudah diarsipkan atau tautannya berubah."
          onRetry={() => setRetry((value) => value + 1)}
        />
        <p>
          <Link to="/katalog" className="link-arrow">
            Kembali ke katalog <span aria-hidden="true">→</span>
          </Link>
        </p>
      </div>
    );
  }
  if (error || !product) {
    return (
      <div className="container page">
        <ErrorState message={error ?? 'Produk tidak dapat dimuat.'} onRetry={() => setRetry((value) => value + 1)} />
      </div>
    );
  }

  const priceLabel = selected
    ? formatRupiah(selected.price)
    : product.minPrice === product.maxPrice
      ? formatRupiah(product.minPrice)
      : `Mulai ${formatRupiah(product.minPrice)}`;
  const groupLabel =
    product.category === 'bantal'
      ? 'Pilih ukuran dan tinggi'
      : product.category === 'furnitur'
        ? 'Pilih finishing'
        : 'Pilih ukuran';
  const canAdd = Boolean(selected?.inStock);
  const dimensions =
    selected &&
    typeof selected.attributes.widthCm === 'number' &&
    typeof selected.attributes.depthCm === 'number' &&
    typeof selected.attributes.heightCm === 'number'
      ? `${selected.attributes.widthCm} × ${selected.attributes.depthCm} × ${selected.attributes.heightCm} cm`
      : null;
  const specRows: Array<{ label: string; value: string }> = [];
  if (selected) {
    for (const [key, value] of Object.entries(selected.attributes)) {
      if (['widthCm', 'depthCm', 'heightCm'].includes(key) && dimensions) continue;
      specRows.push({ label: attributeLabel(key), value: attributeValue(key, value) });
    }
    if (dimensions) specRows.unshift({ label: 'Dimensi', value: dimensions });
    specRows.push({ label: 'SKU', value: selected.sku });
  }

  const shippingPolicy = store?.policies.shipping?.body ?? null;

  const addToCart = () => {
    if (!selected || !selected.inStock) return;
    const image = selected.images[0] ?? product.images[0];
    add(
      {
        sku: selected.sku,
        productSlug: product.slug,
        productName: product.name,
        variantLabel: selected.label,
        unitPrice: selected.price,
        imageUrl: image?.url ?? null,
        imageAlt: image?.alt ?? null,
        category: product.category,
      },
      1,
    );
    notify(`${product.name} — ${selected.label} ditambahkan ke keranjang.`);
    track('add_to_cart', { productId: product.id, sku: selected.sku, quantity: 1 });
  };

  return (
    <>
      <Seo
        title={`${product.name} — Teduh`}
        description={product.summary}
        canonicalPath={`/produk/${product.slug}`}
      />
      <div className="container page product-page">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/katalog">Katalog</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/katalog?category=${product.category}`}>{product.categoryLabel}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{product.name}</span>
        </nav>

        <div className="product-page__grid">
          <div className="gallery">
            <figure className="gallery__main">
              {currentImage ? (
                <img
                  key={currentImage.url}
                  src={currentImage.url}
                  alt={currentImage.alt}
                  width={800}
                  height={600}
                  fetchPriority="high"
                />
              ) : (
                <div className="gallery__placeholder" aria-hidden="true" />
              )}
            </figure>
            {gallery.length > 1 ? (
              <div className="gallery__thumbs" aria-label="Galeri produk">
                {gallery.map((image, index) => (
                  <button
                    key={image.url}
                    type="button"
                    className={`gallery__thumb ${index === activeImage ? 'is-active' : ''}`}
                    onClick={() => setActiveImage(index)}
                    aria-pressed={index === activeImage}
                    aria-label={`Tampilkan gambar ${index + 1}: ${image.alt}`}
                  >
                    <img src={image.url} alt="" width={800} height={600} loading="lazy" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="product-info">
            <p className="eyebrow">{product.categoryLabel}</p>
            <h1>{product.name}</h1>
            <p className="product-info__summary">{product.summary}</p>
            <p className="product-info__price" aria-live="polite">
              {priceLabel}
            </p>

            <fieldset className="variant-picker">
              <legend className="field-label">{groupLabel}</legend>
              <div className="variant-grid">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    className={`variant ${selectedId === variant.id ? 'is-selected' : ''} ${
                      !variant.inStock ? 'is-out' : ''
                    }`}
                    onClick={() => {
                      setSelectedId(variant.id);
                      track('select_variant', { productId: product.id, sku: variant.sku });
                    }}
                    aria-pressed={selectedId === variant.id}
                  >
                    <span>{variant.label}</span>
                    <span className="variant__meta">
                      {formatRupiah(variant.price)}
                      {!variant.inStock ? ' · Stok habis' : ''}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="stock-line" role="status" aria-live="polite">
              {selected ? (
                selected.inStock ? (
                  <>
                    Tersedia <strong>{selected.available}</strong> unit untuk SKU {selected.sku}.
                  </>
                ) : (
                  <>Stok habis untuk SKU {selected.sku}.</>
                )
              ) : (
                <>Pilih varian untuk melihat harga dan ketersediaan.</>
              )}
            </div>

            <div className="product-actions">
              <button type="button" className="btn" onClick={addToCart} disabled={!canAdd}>
                Tambahkan ke keranjang
              </button>
              <Link to="/keranjang" className="btn btn--secondary">
                Lihat keranjang
              </Link>
            </div>
            <p className="product-info__note">
              Keranjang tidak menahan stok. Stok diperiksa ulang saat checkout.
            </p>

            <div className="info-block">
              <h2>Detail produk</h2>
              <p>{product.description}</p>
              {product.care ? (
                <>
                  <h3>Perawatan</h3>
                  <p>{product.care}</p>
                </>
              ) : null}
            </div>

            {specRows.length > 0 ? (
              <div className="info-block">
                <h2>Spesifikasi varian</h2>
                <table className="spec-table">
                  <tbody>
                    {specRows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        <td>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="info-block info-block--shipping">
              <h2>Pengiriman</h2>
              <p>
                {shippingPolicy ??
                  'Ongkir dihitung saat checkout berdasarkan kota, kode pos, dan kelas kirim setiap SKU.'}
              </p>
              <p className="muted">
                Estimasi hari hanya ditampilkan bila tarifnya sudah ditandai terkonfirmasi.
              </p>
            </div>
          </div>
        </div>
      </div>

      {related && related.items.length > 0 ? (
        <section className="section section--related" aria-labelledby="terkait">
          <div className="container">
            <div className="section-heading section-heading--split">
              <h2 id="terkait">Pilihan lain di {product.categoryLabel.toLowerCase()}.</h2>
              <Link to={`/katalog?category=${product.category}`} className="link-arrow">
                Lihat semua <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="product-grid product-grid--three">
              {related.items.map((item) => (
                <ProductCard product={item} key={item.id} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

function GalleryLast(gallery: unknown[]): number {
  return Math.max(0, gallery.length - 1);
}
