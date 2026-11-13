# Ruang Teduh — operasional toko dan transparansi pesanan

Ruang Teduh adalah demo e-commerce furnitur dengan alur pembeli, operasional, dan keuangan yang terhubung. Gunakan database demo saat presentasi. Pembayaran memakai simulator; notifikasi berjalan di dalam aplikasi.

## Skenario demonstrasi (10–15 menit)

1. Jalankan petunjuk instalasi di README, `npm run indexes`, lalu `npm run seed` pada database demo. Buka dua browser/profil untuk sesi pelanggan dan admin yang terpisah.
2. Sebagai pelanggan demo, pilih finishing Serenity Lounge Chair, tambah ke keranjang, isi alamat Jakarta Selatan, cek ongkir, lalu simulasikan pembayaran diterima.
3. Buka detail pesanan: lihat status, riwayat, harga snapshot, batas reservasi, dan dokumen yang bisa dicetak/disimpan PDF melalui dialog cetak browser.
4. Sebagai admin, buka pusat operasional. Pesanan lunas masuk antrean. Laporan menggunakan tanggal WIB; antrean mencakup pekerjaan aktif dari seluruh periode.
5. Buka pesanan, pilih penanggung jawab dan target serah ke kurir, isi estimasi tiba, centang ambil barang → kemas → pemeriksaan, lalu kirim pembaruan untuk pembeli.
6. Halaman pembeli memperbarui status setiap 15 detik saat terlihat. Pembaruan admin juga muncul di notifikasi akun. Tunjukkan daftar ambil dan kemas yang bisa dicetak oleh admin.
7. Pembeli mengajukan bantuan pengiriman dari pesanan. Admin membuka Layanan pelanggan, mengambil tanggung jawab, menentukan prioritas dan target tindak lanjut, lalu membalas. Pembeli melihat balasan dan notifikasi.
8. Demonstrasikan refund: pengajuan hanya untuk pesanan dengan pembayaran diterima. Admin operasional tidak dapat menyetujui/menolak refund. Admin keuangan dapat menyetujui proses; tiket tidak bisa diselesaikan sebelum refund tercatat oleh gateway. Simulator UI saat ini tidak menyediakan aksi refund; invariant tersebut diuji melalui tes integrasi.
9. Buka Rencana stok. Atur batas minimum, target, barang masuk, dan estimasi. Terima sebagian barang dengan referensi surat jalan. Perhatikan stok fisik bertambah dan barang masuk berkurang; lihat audit sebagai super admin.
10. Tunjukkan hasil tes, implementasi transaksi, dan batas integrasi di bawah.

## Fitur dan keputusan teknis

| Area | Implementasi | Mengapa |
| --- | --- | --- |
| Antrean kerja | Pesanan perlu pemeriksaan, pesanan lunas belum diterima, dan tiket aktif; penanggung jawab dan tenggat | Memudahkan tindak lanjut pekerjaan yang tertunda |
| Laporan | Rentang tanggal inklusif dalam WIB, penjualan bruto pesanan berstatus lunas, rata-rata, SKU terlaris, kejadian aktivitas dan kendala ongkir | Definisi angka terlihat jelas; hitungan event tidak disajikan sebagai pengunjung unik |
| Pemenuhan | Penanggung jawab, target serah ke kurir, checklist berurutan, estimasi tiba, tautan pelacakan HTTPS, pesan publik | Menghubungkan pekerjaan gudang dengan informasi pembeli |
| Stok | Batas minimum per SKU, target, rencana barang masuk, penerimaan parsial | Menghindari penggunaan penyesuaian stok umum untuk semua proses |
| Konsistensi stok | Transaksi MongoDB untuk penerimaan + ledger + audit; kunci idempotensi dan revisi rencana | Retry penerimaan tidak menggandakan stok; formulir lama tidak menimpa penerimaan terbaru |
| Layanan pelanggan | Tiket bantuan/pengiriman/retur/refund, pemilik, prioritas, target, balasan dan tautan bukti | Riwayat penanganan tetap terkait pesanan |
| Konflik penyuntingan | Revisi pada tiket dan persiapan pesanan; respons 409 saat versi berubah | Mencegah keputusan staf saling menimpa |
| Hak akses | Sesi + MFA admin + izin API; keputusan refund dibatasi keuangan/super admin | Pembatasan berlaku di server, termasuk ketika API dipanggil langsung |
| Notifikasi | Proyeksi riwayat pesanan dan balasan staf; penanda waktu baca per pengguna | Tidak ada duplikasi notifikasi karena refresh; perubahan status menjadi sumber kebenaran |
| Dokumen | HTML cetak dengan escape teks, akses pemilik/admin, `Cache-Control: no-store` | Harga berasal dari snapshot pesanan; tidak perlu layanan PDF eksternal |

Notifikasi menampilkan 50 pembaruan terbaru, diperbarui saat aplikasi terbuka. Antrean menampilkan maksimal 100 pesanan dan 50 tiket; daftar tiket dan rencana stok memiliki pagination. Target awal 48 jam adalah konfigurasi awal demo, bukan janji layanan komersial. Estimasi tiba diisi operator, bukan data pelacakan langsung dari kurir.

## Bukti verifikasi

```sh
npm run lint
npm run typecheck
npm run build
npm test
npm run test:e2e
```

Tes API baru di `apps/api/tests/experience.test.ts` memeriksa akses lintas akun, pembatasan peran, konflik revisi, notifikasi terbaca, refund, penerimaan stok bersamaan/idempoten, batas tanggal WIB, pengecualian pesanan ditahan, dan escape HTML dokumen.

Playwright menggunakan build frontend yang disajikan oleh API dengan database sementara pada port 4100. Alur browser mencakup transaksi, login MFA admin, persiapan pesanan, balasan tiket, notifikasi, dan lebar layar pembeli 390 px. Screenshot tersedia di `test-results/visual/` setelah E2E.

## Batas demo dan pengembangan berikutnya

- Email/WhatsApp belum terhubung ke penyedia. Tidak ada pesan eksternal yang dikirim. Integrasi berikutnya memerlukan transactional outbox, retry, pemantauan kegagalan, dan konfigurasi penyedia.
- Tautan kurir diisi operator; booking kurir, webhook tracking, label resmi, dan bukti terima kurir belum terintegrasi.
- Retur/refund adalah workflow pengajuan dan keputusan. Persetujuan tidak mengeksekusi transfer dana dan tidak mengembalikan stok otomatis. Pemeriksaan barang retur dan eksekusi refund tetap harus diverifikasi terpisah.
- Dokumen cetak adalah ringkasan transaksi, bukan faktur pajak.
- Laporan tidak menghitung laba, biaya gateway, saldo pencairan, atau pendapatan setelah refund sebagian. Definisi penjualan bruto terlihat pada dashboard.
- Saran restock memakai target stok yang ditentukan operator, belum merupakan prediksi permintaan atau modul pembelian supplier.
- Checklist gudang membantu proses internal; validasi pembayaran, alokasi stok, dan hold tetap menjadi syarat wajib pada endpoint pengiriman yang sudah ada.

## Contoh deskripsi untuk CV

“Membangun aplikasi e-commerce furnitur berbasis React, TypeScript, Express, dan MongoDB, dengan reservasi stok transaksional, pembayaran idempoten, dashboard operasional, workflow layanan pelanggan, MFA dan otorisasi berbasis peran, serta pengujian integrasi dan E2E.”

Sesuaikan deskripsi dengan kontribusi yang bisa Anda jelaskan dan demonstrasikan, termasuk penggunaan alat bantu pengembangan. Saat wawancara, bahas kasus pembayaran timeout, dua pengguna membeli stok terakhir, retry penerimaan barang, dan pemisahan persetujuan refund dari status dana yang terverifikasi.
