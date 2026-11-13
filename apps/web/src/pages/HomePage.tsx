import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";
import { ProductCard } from "../components/ProductCard";
import { ErrorState, LoadingState } from "../components/States";
import { Icon } from "../components/Icon";
import { api, apiErrorMessage, formatRupiah } from "../lib/api";
import type { ProductListResponse, ProductSummary } from "../lib/types";

const groups = [
  { label: "Semua", q: "" },
  { label: "Sofa", q: "sofa" },
  { label: "Kursi", q: "kursi" },
  { label: "Meja", q: "meja" },
  { label: "Tempat tidur", q: "tempat tidur" },
  { label: "Dekorasi", q: "lampu|karpet|bantal" },
];
export function HomePage() {
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [group, setGroup] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .get<ProductListResponse>("/products?perPage=24&sort=terbaru")
      .then((data) => {
        if (active) setProducts(data.items);
      })
      .catch((reason) => {
        if (active) setError(apiErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const displayed = group
    ? products
        ?.filter((p) => new RegExp(group, "i").test(`${p.name} ${p.summary}`))
        .slice(0, 6)
    : products?.slice(3, 9);
  const tags = [
    "cozynest-sofa",
    "veroliving-coffee-table",
    "serenity-lounge-chair",
  ].map((slug) => products?.find((p) => p.slug === slug));
  return (
    <>
      <Seo
        title="Ruang Teduh — Furnitur modern untuk hidup yang lebih nyaman"
        description="Temukan sofa, kursi, meja, dan detail hangat untuk rumahmu. Jelajahi koleksi Ruang Teduh Indonesia."
        canonicalPath="/"
      />
      <section className="collection-hero container">
        <p className="eyebrow">Ruang yang hangat. Hidup yang dekat.</p>
        <h1>
          Furnitur modern.
          <br />
          Ruang penuh cerita.
        </h1>
        <Link to="/katalog" className="btn">
          Jelajahi koleksi <Icon name="arrow" size={18} />
        </Link>
        <div className="collection-hero__image">
          <img
            src="/images/collection/hero.jpg"
            alt="Ruang keluarga hangat dengan sofa krem, meja kayu, dan cahaya alami"
            width="1400"
            height="700"
            fetchPriority="high"
          />
          <span className="image-caption">A little more room for living.</span>
          {tags.map((p, i) =>
            p ? (
              <Link
                key={p.id}
                className={`room-tag room-tag--${i}`}
                to={`/produk/${p.slug}`}
              >
                <span className="room-tag__dot">+</span>
                <span>
                  {p.name}
                  <strong>{formatRupiah(p.minPrice)}</strong>
                </span>
              </Link>
            ) : null,
          )}
        </div>
      </section>
      <section className="section container" id="koleksi-baru">
        <div className="collection-heading">
          <div>
            <p className="eyebrow">Pilihan terbaru</p>
            <h2>
              Kenalan dengan
              <br />
              favorit barumu.
            </h2>
          </div>
          <p>
            Bentuk yang sederhana, material yang hangat. Furnitur pilihan untuk
            menemani momen kecil di rumah.
          </p>
          <Link
            to="/katalog?sort=terbaru"
            className="round-link"
            aria-label="Lihat semua produk terbaru"
          >
            <Icon name="arrow" />
          </Link>
        </div>
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => {
              setError(null);
              setRetry((v) => v + 1);
            }}
          />
        ) : products ? (
          <div className="product-grid product-grid--three arrival-grid">
            {products.slice(0, 3).map((p) => (
              <ProductCard product={p} key={p.id} />
            ))}
          </div>
        ) : (
          <LoadingState label="Memuat koleksi" />
        )}
      </section>
      <section
        className="section container collection-all"
        aria-labelledby="all-products"
      >
        <div className="collection-heading">
          <div>
            <p className="eyebrow">Temukan yang terasa pas</p>
            <h2 id="all-products">Untuk setiap sudut.</h2>
          </div>
          <div className="collection-tabs" aria-label="Jenis furnitur">
            {groups.map((g) => (
              <button
                key={g.label}
                className={group === g.q ? "is-active" : ""}
                onClick={() => setGroup(g.q)}
                aria-pressed={group === g.q}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <div className="product-grid product-grid--three">
          {displayed?.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        {displayed?.length === 0 ? (
          <p className="state-block">Belum ada produk dalam pilihan ini.</p>
        ) : null}
        <div className="section__cta">
          <Link to="/katalog" className="btn btn--secondary">
            Lihat semua koleksi <Icon name="arrow" size={18} />
          </Link>
        </div>
      </section>
      <section className="story-section container" id="tentang">
        <div className="story-section__copy">
          <p className="eyebrow">Tentang Ruang Teduh</p>
          <h2>
            Gaya bertemu
            <br />
            rasa nyaman.
          </h2>
          <p>
            Kami percaya rumah bukan sekadar tempat. Ia adalah ruang untuk
            berhenti sejenak, berkumpul, dan menjadi diri sendiri.
          </p>
          <p>
            Koleksi bernuansa alami dengan bentuk modern, dipilih untuk
            keseharian di rumah Indonesia.
          </p>
          <div className="story-facts">
            <div>
              <strong>Detail jelas</strong>
              <span>Bahan, dimensi, dan pilihan varian</span>
            </div>
            <div>
              <strong>Lebih tenang</strong>
              <span>Biaya dan status pesanan transparan</span>
            </div>
          </div>
          <Link to="/jurnal" className="link-arrow">
            Cerita & inspirasi ruang <Icon name="arrow" size={18} />
          </Link>
        </div>
        <img
          src="/images/collection/style-comfort.jpg"
          alt="Kursi aksen kuning di sudut ruangan dengan lampu dan tanaman"
          width="700"
          height="850"
          loading="lazy"
        />
      </section>
      <section className="combo-section container">
        <img
          src="/images/collection/curated-combo.jpg"
          alt="Pilihan furnitur kayu dan kursi untuk melengkapi ruang keluarga"
          width="1400"
          height="600"
          loading="lazy"
        />
        <div>
          <p className="eyebrow">Lebih serasi, lebih berarti</p>
          <h2>
            Satu ruang.
            <br />
            Banyak cerita.
          </h2>
          <p>
            Padukan Serenity dan Veroliving
            <br />
            untuk sudut favorit yang baru.
          </p>
          <Link to="/katalog?q=walnut" className="btn">
            Temukan paduannya <Icon name="arrow" size={18} />
          </Link>
        </div>
      </section>
      <section
        className="collection-promises container"
        aria-label="Belanja di Ruang Teduh"
      >
        <div>
          <Icon name="box" />
          <strong>Pilih dengan yakin</strong>
          <p>Dimensi dan material di setiap produk.</p>
        </div>
        <div>
          <Icon name="truck" />
          <strong>Ongkir sebelum bayar</strong>
          <p>Tarif sesuai alamat tujuan di Indonesia.</p>
        </div>
        <div>
          <Icon name="chat" />
          <strong>Tetap terhubung</strong>
          <p>Pantau pesanan dan hubungi tim melalui akun.</p>
        </div>
      </section>
    </>
  );
}
