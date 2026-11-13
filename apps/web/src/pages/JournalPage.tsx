import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";
import { Icon } from "../components/Icon";
const stories = [
  {
    id: "sudut-baca",
    image: "serenity-detail-4",
    label: "Ritual sehari-hari",
    title: "Satu sudut, waktu untuk diri sendiri.",
    text: "Mulai dari kursi yang nyaman, meja kecil untuk buku, dan cahaya yang cukup. Pilih tempat yang tidak menghalangi jalur berjalan. Letakkan lampu di samping kursi agar cahaya jatuh ke halaman, lalu tambahkan bantal untuk menyesuaikan posisi duduk.",
    query: "kursi",
  },
  {
    id: "mengukur-ruang",
    image: "veroliving-coffee-table",
    label: "Panduan memilih",
    title: "Ukur dulu, jatuh hati kemudian.",
    text: "Catat panjang dan lebar area yang tersedia, lalu cocokkan dengan dimensi varian produk. Tandai jejak furnitur di lantai dengan selotip kertas. Periksa juga lebar pintu, jalur tangga, dan lift. Sampaikan kendala akses pada catatan pengiriman saat checkout.",
    query: "meja",
  },
  {
    id: "merawat-kayu",
    image: "atelier-wood-care-kit",
    label: "Merawat yang berarti",
    title: "Biarkan kehangatan kayu bertahan.",
    text: "Gunakan kain lembut untuk membersihkan debu dan segera keringkan tumpahan. Alas gelas membantu mencegah bekas air. Hindari menempatkan furnitur kayu terlalu dekat sumber panas atau area lembap. Ikuti petunjuk perawatan masing-masing material sebelum memakai poles.",
    query: "care",
  },
];
export function JournalPage() {
  return (
    <>
      <Seo
        title="Jurnal ruang — Ruang Teduh"
        description="Inspirasi menata sudut baca, memilih ukuran, dan merawat furnitur di rumah."
        canonicalPath="/jurnal"
      />
      <div className="container page">
        <header className="page-head">
          <p className="eyebrow">Jurnal ruang</p>
          <h1>
            Cerita kecil.
            <br />
            Rumah yang berarti.
          </h1>
          <p className="page-head__lead">
            Catatan sederhana untuk memilih, menata, dan merawat ruangmu.
          </p>
        </header>
        <div className="journal-list">
          {stories.map((story) => (
            <article key={story.id} id={story.id}>
              <img
                src={`/images/collection/${story.image}.jpg`}
                alt={story.title}
                width="640"
                height="600"
                loading="lazy"
              />
              <div>
                <p className="eyebrow">{story.label}</p>
                <h2>{story.title}</h2>
                <p>{story.text}</p>
                <Link to={`/katalog?q=${story.query}`} className="link-arrow">
                  Lihat pilihan terkait <Icon name="arrow" size={18} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
