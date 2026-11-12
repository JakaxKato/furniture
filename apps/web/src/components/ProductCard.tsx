import { Link } from 'react-router-dom';
import { formatRupiah } from '../lib/api';
import type { ProductSummary } from '../lib/types';

export function ProductCard({ product, eager = false }: { product: ProductSummary; eager?: boolean }) {
  const image = product.images[0];
  const price =
    product.minPrice === product.maxPrice
      ? formatRupiah(product.minPrice)
      : `Mulai ${formatRupiah(product.minPrice)}`;
  return (
    <article className="product-card">
      <Link to={`/produk/${product.slug}`} className="product-card__link">
        <div className="product-card__media">
          {image ? (
            <img
              src={image.url}
              alt={image.alt}
              width={800}
              height={600}
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
            />
          ) : (
            <div className="product-card__placeholder" aria-hidden="true" />
          )}
          {!product.inStock ? <span className="badge badge--out">Stok habis</span> : null}
        </div>
        <div className="product-card__body">
          <p className="product-card__category">{product.categoryLabel}</p>
          <h3>{product.name}</h3>
          <p className="product-card__price">{price}</p>
        </div>
      </Link>
    </article>
  );
}
