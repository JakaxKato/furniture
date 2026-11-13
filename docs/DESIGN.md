# Ruang Teduh · pembaruan desain

Referensi: delapan dokumen HTML Woodora dari file yang diberikan pengguna. HTML referensi digunakan sebagai brief visual dan konten; skrip CDN dan formulir statisnya tidak dijalankan sebagai aplikasi. Implementasi tetap menggunakan React/TypeScript dan CSS lokal, dengan transaksi serta otorisasi pada API yang sudah ada.

## Pemetaan

| Referensi | Implementasi |
| --- | --- |
| Beranda | Hero lebar dengan tautan produk, tiga produk terbaru, pilihan jenis furnitur, cerita brand, kurasi pasangan, footer Indonesia |
| Detail Serenity | Galeri lima foto, pilihan finishing, jumlah, stok aktual, dimensi, perawatan, produk terkait |
| Shopping bag | Keranjang tamu persisten, ubah jumlah/hapus, total sementara dan lanjut checkout |
| Mini cart | Drawer dari header, jumlah dan harga mengikuti keranjang yang sama; modal dapat ditutup dengan Escape dan mengembalikan fokus |
| Checkout dan review | Identitas akun, alamat Indonesia, catatan akses pengiriman, pemeriksaan ongkir, ringkasan dari API, konfirmasi ulang jika harga berubah |
| Pembayaran | Tahapan visual konsisten; adapter simulasi yang tersedia tetap dipakai untuk demo. Tidak mengumpulkan data kartu palsu |
| Konfirmasi | Konfirmasi setelah benar-benar lunas, tahapan pemenuhan, estimasi operator, resi, dokumen cetak, tiket bantuan |
| Admin (tidak ada dalam referensi) | Sidebar krem, navigasi berikon, kartu statistik dan tabel yang memakai tokens visual toko. Hak akses, MFA, audit dan workflow tetap berlaku |
| Blog | Jurnal lokal berisi panduan sudut baca, mengukur ruang, dan perawatan kayu |

## Katalog

14 produk: The Cozynest Sofa, Veroliving Coffee Table, Elmora Modern Desk, Serenity Lounge Chair & Ottoman, Rustic Side Table, Cascade Bookshelf, Aurora Bed Frame, Maplecraft Dining Chairs, Coastal Patio Set, Klint Floor Monolith, Fjord Woven Area Rug, Atelier Wood Care Kit, Beeswax Care Kit, dan Linen Cushion Set.

Nama dan foto mengikuti referensi; harga IDR, stok, sebagian dimensi, dan spesifikasi merupakan data demo. Harga bukan hasil konversi kurs atau penawaran aktif. Foto disimpan di `apps/web/public/images/collection`, sumber URL dan deskripsi referensi di `reference-assets.json`. Font disimpan di `apps/web/public/fonts`, dengan lisensi OFL. Ulasan fiktif, sertifikasi, diskon, trial 100 malam, dan garansi 10 tahun dalam mockup tidak dipublikasikan sebagai klaim bisnis.

Model kategori dan kelas pengiriman lama dipertahankan untuk kompatibilitas inventaris serta pesanan. Pilihan jenis furnitur pada toko memakai pencarian katalog; kategori tanpa produk terbit tidak ditampilkan di filter. Spesifikasi semua varian dapat diedit admin.

## Memperbarui database demo

`npm run catalog:upgrade` menambahkan produk dan inventaris dalam transaksi MongoDB, melewati slug baru yang sudah ada, serta mengarsipkan sembilan slug demo terbit lama. Tidak menghapus pesanan, pengguna, inventaris lama, tiket, atau ledger. Produk yang dibuat admin tetap ada. Produk baru yang telah diedit admin tidak ditimpa ketika perintah diulang. Perintah dibatasi ke mode demo nonproduksi.

Untuk instalasi pertama gunakan alur `seed` pada README. Seed bersifat reset seluruh data demo. Kredensial login demo tetap menggunakan domain `teduh.example` agar pengguna lama tidak kehilangan akses; identitas publik menggunakan Ruang Teduh.

## Verifikasi

- Integrasi API mencakup pembaruan katalog yang idempoten, stok yang sedang ditahan/dialokasikan, dan pelestarian edit admin.
- Playwright menjalankan checkout Serenity, mini cart, login, ongkir Jakarta, pembayaran simulasi, MFA admin, checklist gudang, tiket bantuan, dan notifikasi.
- Pemeriksaan visual pada desktop dan ponsel; screenshot di `test-results/visual` setelah tes browser.

Voucher, bundle diskon, wishlist tersinkron, newsletter, ulasan pembeli, dan layanan pemasangan khusus belum merupakan fitur aktif. Kanal pembayaran dan pengiriman nyata tetap membutuhkan konfigurasi penyedia. Tidak ada janji email terkirim pada halaman konfirmasi karena layanan email/WhatsApp belum dipasang.
