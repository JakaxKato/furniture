import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { useStore } from '../context/StoreContext';
import { api, formatRupiah } from '../lib/api';
import type { ProductDetail } from '../lib/types';

const categories = [
  {
    value: 'kasur',
    label: 'Kasur',
    copy: 'Ukuran 90 × 200 cm hingga 180 × 200 cm. Ketebalan 15–25 cm.',
    image: '/images/categories/kasur.svg',
    alt: 'Kasur dengan seprai putih tulang di kamar berwarna hangat',
  },
  {
    value: 'bantal',
    label: 'Bantal',
    copy: 'Isi serat poliester atau lateks. Tinggi 10–14 cm.',
    image: '/images/categories/bantal.svg',
    alt: 'Dua bantal di atas bangku kayu',
  },
  {
    value: 'furnitur',
    label: 'Furnitur',
    copy: 'Kayu jati dan pinus. Dimensi lebar, kedalaman, dan tinggi tercantum.',
    image: '/images/categories/furnitur.svg',
    alt: 'Kursi kayu dan meja samping di ruang putih tulang',
  },
] as const;

export function HomePage() {
  const { store } = useStore();
  const [featured, setFeatured] = useState<ProductDetail | null>(null);

  useEffect(() => {
    if (!store?.featuredProductSlug) return;
    let cancelled = false;
    api
      .get<ProductDetail>(`/products/${store.featuredProductSlug}`)
      .then((product) => {
        if (!cancelled) setFeatured(product);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [store?.featuredProductSlug]);

  const featuredVariant = featured?.variants[0];
  const specs = featuredVariant
    ? [
        featuredVariant.attributes.material ? `Bahan ${featuredVariant.attributes.material}` : null,
        featuredVariant.attributes.widthCm &&
        featuredVariant.attributes.depthCm &&
        featuredVariant.attributes.heightCm
          ? `${featuredVariant.attributes.widthCm} × ${featuredVariant.attributes.depthCm} × ${featuredVariant.attributes.heightCm} cm`
          : null,
        featured?.variants.length && featured.variants.length > 1
          ? `${featured.variants.length} pilihan finishing`
          : null,
      ].filter(Boolean)
    : [];

  return (
    <>
      <Seo
        title={`${store?.brand.name ?? 'Teduh'} — Kasur, bantal, dan furnitur`}
        description={
          store?.brand.description ??
          'Kasur, bantal, dan furnitur dengan dimensi dalam sentimeter, bahan yang tercantum, dan ketersediaan per varian.'
        }
        canonicalPath="/"
      />
      <section className="hero">
        <div className="container hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">Kasur · Bantal · Furnitur</p>
            <h1>
              Ukuran yang pas,
              <br />
              bahan yang <em>jelas.</em>
            </h1>
            <p className="hero__lead">
              Setiap varian mencantumkan dimensi dalam sentimeter, bahan, dan ketersediaan.
              Ongkir dihitung dari kode pos dan kelas kirim di checkout.
            </p>
            <div className="hero__actions">
              <Link to="/katalog" className="btn">
                Jelajahi katalog
              </Link>
              <Link to="/katalog?category=kasur" className="link-arrow">
                Lihat pilihan kasur <span aria-hidden="true">→</span>
              </Link>
            </div>
            <dl className="hero__facts">
              <div>
                <dt>Dimensi</dt>
                <dd>sentimeter</dd>
              </div>
              <div>
                <dt>Harga</dt>
                <dd>Rupiah tanpa pecahan</dd>
              </div>
              <div>
                <dt>Stok</dt>
                <dd>terlihat per SKU</dd>
              </div>
            </dl>
          </div>
          <figure className="hero__visual">
            <img
              src="/images/home/hero-interior.svg"
              alt="Ilustrasi ruang keluarga putih tulang dengan sofa krem, dinding zaitun, meja samping, dan tanaman"
              width={1200}
              height={900}
              fetchPriority="high"
            />
            <figcaption>
              Sofa linen dua dudukan, 160 × 85 × 78 cm. Ilustrasi aset demo.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="section" aria-labelledby="pintu-masuk">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Mulai dari kebutuhan</p>
            <h2 id="pintu-masuk">Tiga cara menemukan produk yang tepat.</h2>
          </div>
          <div className="door-grid">
            {categories.map((category, index) => (
              <Link
                key={category.value}
                to={`/katalog?category=${category.value}`}
                className={`door door--${category.value}`}
              >
                <div className="door__media">
                  <img src={category.image} alt={category.alt} width={800} height={600} loading="lazy" />
                  <span className="door__number" aria-hidden="true">
                    0{index + 1}
                  </span>
                </div>
                <div className="door__body">
                  <h3>{category.label}</h3>
                  <p>{category.copy}</p>
                  <span className="link-arrow">
                    Lihat {category.label.toLowerCase()} <span aria-hidden="true">→</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="service-strip" aria-label="Informasi layanan toko">
        <div className="container service-strip__grid">
          <p>
            <strong>Dimensi jelas.</strong> Lebar, kedalaman, dan tinggi tercantum dalam sentimeter.
          </p>
          <p>
            <strong>Ongkir dihitung server.</strong> Tarif mengikuti zona, kode pos, dan kelas kirim.
          </p>
          <p>
            <strong>Stok per SKU.</strong> Jumlah yang dapat dibeli diperiksa ulang saat checkout.
          </p>
        </div>
      </section>

      {featured ? (
        <section className="feature" aria-labelledby="sorotan-koleksi">
          <div className="container feature__grid">
            <figure className="feature__media">
              <img
                src={featured.images[1]?.url ?? featured.images[0]?.url}
                alt={featured.images[1]?.alt ?? featured.images[0]?.alt ?? featured.name}
                width={800}
                height={600}
                loading="lazy"
              />
              <figcaption>Ilustrasi {featured.name.toLowerCase()}, aset demo.</figcaption>
            </figure>
            <div className="feature__copy">
              <p className="eyebrow">Sorotan koleksi</p>
              <h2 id="sorotan-koleksi">{featured.name}</h2>
              <p className="feature__summary">{featured.summary}</p>
              <ul className="spec-list">
                {specs.map((spec) => (
                  <li key={String(spec)}>{spec}</li>
                ))}
              </ul>
              <p className="feature__price">
                Mulai <strong>{formatRupiah(featured.minPrice)}</strong>
              </p>
              <div className="feature__actions">
                <Link to={`/produk/${featured.slug}`} className="btn btn--light">
                  Lihat sofa
                </Link>
                <Link to="/katalog?category=furnitur" className="link-arrow link-arrow--light">
                  Semua furnitur <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="section section--steps" aria-labelledby="cara-membeli">
        <div className="container">
          <div className="section-heading section-heading--split">
            <div>
              <p className="eyebrow">Alur pembelian</p>
              <h2 id="cara-membeli">Tiga langkah sebelum bayar.</h2>
            </div>
            <p className="muted section-heading__aside">
              Total akhir selalu dihitung ulang oleh server sebelum transaksi dibuat.
            </p>
          </div>
          <ol className="steps">
            <li>
              <span className="steps__number">01</span>
              <div>
                <h3>Pilih ukuran</h3>
                <p>Foto, SKU, harga, dan stok mengikuti varian yang dipilih.</p>
              </div>
            </li>
            <li>
              <span className="steps__number">02</span>
              <div>
                <h3>Cek ongkir</h3>
                <p>Masukkan kota dan kode pos. Tarif per kelas kirim ditampilkan sebelum bayar.</p>
              </div>
            </li>
            <li>
              <span className="steps__number">03</span>
              <div>
                <h3>Bayar sekarang</h3>
                <p>Kamu diarahkan ke halaman pembayaran setelah ringkasan dikonfirmasi.</p>
              </div>
            </li>
          </ol>
          <div className="section__cta">
            <Link to="/katalog" className="btn">
              Mulai dari katalog
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
