# Teduh — toko kasur, bantal, dan furnitur

Panduan fitur operasional, skenario demo recruiter, keputusan teknis, dan batas integrasi: [Portofolio Teduh](docs/PORTFOLIO.md).

MVP toko online Indonesia dengan **MongoDB + Mongoose, Express, React + Vite, dan TypeScript**. Storefront berbahasa Indonesia, harga Rupiah bilangan bulat, dimensi sentimeter, dan pembayaran Midtrans Snap dengan adapter simulasi untuk pengembangan/tes.

> **Status: demo/pengembangan, belum siap produksi.** Identitas merek, kontak, produk, harga, stok, tarif, kanal pembayaran, dan kebijakan retur/garansi/privasi di repo ini adalah data contoh. Kebijakan yang belum disetujui tidak dirender ke publik. Lihat [Sebelum rilis](#sebelum-rilis).

## Ringkasan yang sudah berjalan

- Beranda dua kolom putih tulang–zaitun, judul serif, tiga pintu masuk kategori, dan satu sorotan koleksi dengan spesifikasi dari API.
- Katalog dengan pencarian, filter umum dan per kategori, urutan, paginasi, serta seluruh state di URL. Desktop memakai filter kiri dan grid tiga kolom; ponsel memakai dialog filter dua kolom dengan fokus kembali ke tombol.
- Detail produk dengan galeri, varian, SKU, harga/stok per varian, spesifikasi, perawatan, dan tambah ke keranjang.
- Keranjang tamu (localStorage) yang terbawa saat login, checkout dengan login, alamat tervalidasi, ongkir server per zona/kelas, total server, dan konfirmasi ulang bila ringkasan berubah.
- Autentikasi sesi server: cookie `HttpOnly`, rotasi saat login, CSRF + origin check, Argon2id, reset kata sandi sekali pakai, MFA TOTP wajib untuk admin.
- Pesanan atomik dengan reservasi stok, `Idempotency-Key`, dan satu percobaan pembayaran terbuka per pesanan.
- Midtrans Snap di backend, verifikasi webhook dengan signature waktu konstan, pengambilan status langsung dari gateway, transisi idempoten, rekonsiliasi berkala, dan penanganan pembayaran terlambat/refund/chargeback.
- Panel admin untuk produk/varian, stok, zona dan tarif, pesanan, kasus pembayaran, serta audit. Hak akses dipisah per peran dan MFA.
- Sitemap, `robots.txt`, metadata server-side untuk halaman produk, URL kanonis, dan metadata klien.
- Ilustrasi SVG orisinal untuk demo. Foto referensi tidak tersedia di workspace; desain diturunkan dari deskripsi dan aset dibuat khusus agar hak pakai jelas. Ganti dengan foto berlisensi sebelum rilis.

## Stack dan struktur

```
apps/
  api/   Express + Mongoose + Zod, REST /api/v1, skrip seed/index/reconcile
  web/   React 18 + Vite + React Router, storefront dan panel admin
e2e/     Tes Playwright (alur checkout, responsif, tangkapan visual)
```

Produksi menggunakan **satu origin**: Express menyajikan `apps/web/dist` dan API `/api/v1`. Di pengembangan Vite mem-proxy `/api` ke API port 4000.

## Mulai cepat

### Prasyarat

- Node.js 22.12+ (LTS) dan npm 10+.
- MongoDB 7 **replica set** (transaksi dan reservasi stok memerlukannya).
- Docker Desktop/Compose (opsional tetapi paling mudah), atau MongoDB lokal.
- Untuk tes browser: Chromium Playwright.

### 1. Jalankan MongoDB replica set

Dengan Docker:

```bash
docker compose up -d
docker compose logs -f mongo-init
```

`mongo-init` membuat replica set `rs0` dengan member `localhost:27018`. Data disimpan di volume `teduh-mongo-data`. Port 27018 dipakai agar tidak bentrok dengan layanan MongoDB standalone yang mungkin sudah berjalan di 27017, dan hanya di-bind ke localhost. Jika mesin belum punya layanan tersebut, port boleh diganti asalkan URI, compose, dan `rs.initiate` konsisten. Compose ini **tanpa autentikasi** dan hanya untuk lokal; produksi wajib memakai MongoDB dengan auth, TLS, dan akun hak minimum.

Tanpa Docker (contoh Windows/Linux):

```bash
mongod --replSet rs0 --port 27018 --dbpath ./data/db --bind_ip 127.0.0.1
# di terminal lain, sekali saja:
mongosh --port 27018 --eval "rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27018' }] })"
```

### 2. Konfigurasi environment

```bash
cp .env.example .env
```

Isi minimum untuk pengembangan:

| Variabel | Nilai demo | Catatan |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27018/teduh?replicaSet=rs0` | Wajib replica set; port default compose 27018 |
| `MONGODB_DB` | `teduh` | Harus sama dengan nama DB di URI |
| `APP_ORIGIN` | `http://localhost:5173` | Origin CSRF/CORS dan callback pembayaran |
| `SITE_URL` | `http://localhost:5173` | Sitemap dan kanonis |
| `COOKIE_SECURE` | `false` | Wajib `true` di produksi |
| `ALLOWED_ORIGINS` | kosong | Origin tambahan dipisah koma; kosong = same-origin |
| `TRUST_PROXY` | `0` | Set `1` (atau sesuai hop) di belakang reverse proxy agar IP rate limit benar |
| `MFA_ENCRYPTION_KEY` | 32 byte base64 | Wajib untuk akun admin |
| `PAYMENT_ADAPTER` | `simulation` | Simulasi ditolak saat startup produksi |
| `EMAIL_MODE` | `file` | Email reset ditulis ke `apps/api/var/mail`; tidak boleh di produksi |
| `RATE_LIMIT_DISABLED` | `false` | Rate limit disimpan di MongoDB |

Buat kunci MFA baru:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Workspace ini sudah menyertakan `.env` demo yang di-gitignore. Ganti nilainya untuk lingkungan lain, lalu seed ulang.

Variabel lain yang tersedia di `.env.example`: sesi, Midtrans, batas waktu Snap/metode/reservasi, interval rekonsiliasi, label kanal, kartu, dan folder email. Produksi wajib memakai `APP_ORIGIN`/`SITE_URL` HTTPS, cookie Secure, adapter `midtrans` dengan Server Key, serta MFA key; startup akan menolak kombinasi yang tidak aman.

### 3. Install, buat indeks, seed, jalankan

```bash
npm install
npm run indexes
npm run seed
npm run dev
```

- Storefront: `http://localhost:5173`
- API: `http://localhost:4000/api/v1`

`npm run seed` **menghapus seluruh koleksi** di database yang dipilih, lalu membuat ulang katalog, stok, zona, dan akun demo. Skrip menolak `NODE_ENV=production`.

### Akun demo

| Peran | Email | Kata sandi | MFA |
| --- | --- | --- | --- |
| Pelanggan | `pelanggan@teduh.example` | `Pelanggan123` | — |
| Super admin | `admin@teduh.example` | `AdminDemo123` | TOTP `JBSWY3DPEHPK3PXP` |
| Admin katalog | `katalog@teduh.example` | `AdminDemo123` | TOTP yang sama |
| Admin operasional | `operasional@teduh.example` | `AdminDemo123` | TOTP yang sama |
| Admin keuangan | `keuangan@teduh.example` | `AdminDemo123` | TOTP yang sama |

Secret TOTP demo dicetak oleh `npm run seed` ke stdout (bukan ke log aplikasi). Tambahkan ke aplikasi autentikator. **Jangan pakai kredensial ini di produksi.** Admin pertama produksi dibuat lewat bootstrap:

```bash
# Linux/macOS
ADMIN_EMAIL=admin@domain.example \
ADMIN_PASSWORD='KataSandiKuat123' \
ADMIN_NAME='Admin Utama' \
npm run bootstrap-admin
```

PowerShell:

```powershell
$env:ADMIN_EMAIL="admin@domain.example"
$env:ADMIN_PASSWORD="KataSandiKuat123"
$env:ADMIN_NAME="Admin Utama"
npm run bootstrap-admin
```

Perintah mencetak secret TOTP dan URI `otpauth` sekali. Simpan di pengelola rahasia; tidak ditulis ke log.

### Build dan jalankan produksi-like

```bash
npm run build
NODE_ENV=production npm run start
```

Di Windows PowerShell, set `$env:NODE_ENV="production"` sebelum `npm run start`. Express menyajikan API dan storefront pada `http://localhost:4000`.

## Konfigurasi toko

- **Identitas, kontak, area layanan, kebijakan publik, produk unggulan:** `apps/api/src/config/store.ts`.
- **Seed zona dan tarif awal:** `shippingSeeds` di file yang sama. Setelah seed, admin mengubah/menambah zona di panel; setiap perubahan menaikkan versi dan pesanan menyimpan versi tarif yang dipakai.
- **Kebijakan:** hanya `confirmed: true` yang dikirim ke storefront dan ditampilkan di `/bantuan`. Naskah retur, garansi, dan privasi sengaja belum dikonfirmasi.
- **Kanal pembayaran:** label `PAYMENT_CHANNELS` hanya ditampilkan; kanal yang benar-benar aktif harus sesuai akun merchant Midtrans.
- **Aset:** SVG di `apps/web/public/images` dibuat khusus untuk demo. Ganti dengan foto berlisensi dan perbarui URL di seed/panel.

## Peran admin dan izin

| Peran | Kewenangan utama |
| --- | --- |
| `super_admin` | Semua, termasuk audit |
| `admin_catalog` | Produk/varian, inventaris, zona/tarif |
| `admin_ops` | Inventaris, zona/tarif, pesanan, pemenuhan pengiriman |
| `admin_finance` | Pesanan, kasus pembayaran, hold/release |

Semua endpoint admin memerlukan sesi admin dengan MFA terverifikasi. Pemeriksaan izin dan kepemilikan dilakukan di server. Admin tidak memiliki endpoint untuk menetapkan pembayaran lunas secara manual.

## Alur checkout dan pembayaran

1. Keranjang tamu disimpan lokal; login diminta di checkout. Keranjang tidak menahan stok.
2. `POST /checkout/quote` menghitung ulang harga, stok, ongkir zona/kelas, dan total. Ringkasan mengembalikan `quoteHash`.
3. `POST /orders` memerlukan `Idempotency-Key`. Server mengulang quote; jika hash berubah → `409 QUOTE_CHANGED` + ringkasan baru. Pelanggan harus memeriksa dan mengirim ulang dengan hash baru.
4. Pesanan, snapshot item/alamat/biaya, reservasi stok, dan key idempotensi dibuat dalam satu transaksi MongoDB. Stok ditahan dengan update atomik yang mencegah angka negatif.
5. Percobaan bayar disimpan dengan `gatewayOrderId` unik **sebelum** Snap dipanggil. Hanya satu percobaan terbuka per pesanan (partial unique index). Timeout ditandai `uncertain` dan direkonsiliasi sebelum referensi baru boleh dibuat.
6. Webhook:
   - format payload divalidasi, signature SHA-512 Midtrans dihitung dari nilai yang diterima dan dibandingkan waktu konstan;
   - status **tidak** diambil dari body, tetapi dari GET Status gateway;
   - order ID, transaction ID, dan nominal dicocokkan dengan catatan internal;
   - transisi berjalan idempoten dalam transaksi MongoDB. Duplikat/terlambat/tidak berurutan memakai jalur yang sama.
7. `settlement` dapat melunasi. `capture` hanya untuk kartu yang diaktifkan dan fraud `accept`. Refund/chargeback membuat kasus dan menahan pengiriman yang belum berangkat; stok tidak kembali otomatis.
8. Job rekonsiliasi memeriksa percobaan terbuka, 404 GET Status, batas halaman Snap, dan batas metode. Reservasi hanya dilepas setelah penutupan terverifikasi. Pembayaran yang masuk setelah stok dilepas → `review`, pengiriman ditahan, kasus `late_payment`.

### Status internal pembayaran

`pending`, `verifying`, `paid`, `failed`, `expired`, `cancelled`, `review`, `partially_refunded`, `refunded`, `disputed`. Status pengiriman terpisah: `pending`, `ready`, `shipped`, `delivered`, dengan flag hold.

## Pembayaran: simulasi vs sandbox

### Adapter simulasi (dipakai tes)

- `PAYMENT_ADAPTER=simulation` hanya boleh di development/test. Env parser dan konstruktor adapter menolak produksi.
- Halaman `/pembayaran-simulasi/:gatewayOrderId` menawarkan hasil settlement, gagal, kedaluwarsa, dan `capture` + fraud challenge. Aksi ini masuk ke mesin transisi yang sama.
- Tidak ada uang atau data kartu yang diproses.

### Midtrans sandbox (belum dijalankan di repo ini)

Untuk menguji dengan akun merchant sandbox:

```env
PAYMENT_ADAPTER=midtrans
MIDTRANS_SERVER_KEY=SB-Mid-server-...
MIDTRANS_CLIENT_KEY=SB-Mid-client-...   # tidak dipakai server saat ini
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_API_BASE=https://api.sandbox.midtrans.com
MIDTRANS_SNAP_API_BASE=https://app.sandbox.midtrans.com
MIDTRANS_ALLOWED_REDIRECT_HOSTS=app.sandbox.midtrans.com
```

- Server Key hanya di backend. Formulir toko tidak menangani nomor kartu/CVV.
- Aktifkan kanal yang benar-benar tersedia di akun merchant; isi `PAYMENT_CHANNELS` sesuai label kanal. Untuk kartu, uji fraud accept/challenge lalu set `CARD_PAYMENT_ENABLED=true` hanya bila kanal kartu disetujui.
- Daftarkan Notification URL di dashboard Midtrans: `https://<domain-anda>/api/v1/webhooks/midtrans`. Untuk lokal, gunakan tunnel HTTPS sementara (mis. cloudflared/ngrok) hanya untuk sandbox.
- Jangan mengandalkan `curl` webhook palsu untuk melunasi pesanan: server selalu mengambil status langsung dari Midtrans. Signature tetap wajib valid.
- Callback browser hanya membuka halaman pesanan; status dibaca dari backend.

## Job rekonsiliasi

- Server menjalankan `reconcileOnce()` setiap `RECONCILE_INTERVAL_SECONDS` (default 120 detik).
- Satu kali manual: `npm run reconcile`
- Loop manual: `npm run reconcile:loop`
- Job memproses percobaan terbuka dan event webhook yang tertunda, dengan backoff untuk kegagalan gateway. Jalankan aman berulang; finalisasi stok memakai transaksi dan status kondisional.

## Skema dan indeks MongoDB

Indeks penting (dibuat oleh skema dan `npm run indexes`):

- `users.email` unik
- `sessions.tokenHash` unik, TTL pada `expiresAt`
- `products.slug` unik; `products.variants.sku` unik
- `inventories.sku` unik
- `orders.orderNumber` unik; `(userId, createdAt)`; status
- `checkoutkeys (userId, key)` unik (key disimpan dalam hash)
- `paymentattempts.gatewayOrderId` unik; partial unique `(orderId)` untuk `open: true`
- `webhookevents.eventKey` unik
- `paymentcases.caseNumber` unik
- `auditlogs` menurut waktu/pelaku/target
- bucket rate limit dengan TTL

Pengembangan memakai `autoIndex`. Produksi menonaktifkannya; jalankan `npm run indexes` setelah deploy. Belum ada migrasi data berversi karena ini skema awal; tambahkan tool migrasi sebelum mengubah bentuk dokumen produksi.

## API ringkas

| Endpoint | Akses |
| --- | --- |
| `GET /api/v1/store` | Publik; brand, kontak, kebijakan terkonfirmasi, area |
| `GET /api/v1/products`, `/products/facets`, `/products/:slug` | Publik |
| `POST /api/v1/auth/*` | Daftar, login, logout, reset, CSRF |
| `POST /api/v1/checkout/quote`, `/orders` | Pelanggan |
| `GET /api/v1/orders`, `/orders/:number` | Hanya pesanan milik sesi |
| `POST /api/v1/orders/:number/payment` | Membuat/melanjutkan percobaan Snap |
| `POST /api/v1/webhooks/midtrans` | Gateway; signature + GET Status |
| `POST /api/v1/payments/simulation/:id` | Hanya non-produksi, pemilik pesanan |
| `/api/v1/admin/*` | Admin + MFA + izin |
| `GET /sitemap.xml`, `/robots.txt` | Publik |
| `GET /api/v1/health` | Status DB minimal |

Kode error yang dipetakan UI antara lain `VALIDATION_ERROR`, `CSRF_INVALID`, `UNAUTHORIZED`, `QUOTE_CHANGED`, `OUT_OF_STOCK`, `SHIPPING_UNAVAILABLE`, `IDEMPOTENCY_CONFLICT`, `PAYMENT_UNCERTAIN`, `ORDER_NOT_PAYABLE`.

## Keamanan

- Sesi server dengan token acak hash, cookie `HttpOnly`, `Secure` di produksi, `SameSite=Lax`; rotasi saat login; cabut saat logout/reset.
- Argon2id (19 MiB, t=2, p=1); reset token acak 30 menit, disimpan hash, sekali pakai; respons permintaan reset seragam.
- MFA TOTP wajib admin; secret dienkripsi AES-256-GCM dengan kunci environment; bootstrap operator.
- Origin + CSRF ganda (cookie non-HttpOnly + header) di semua mutasi browser; webhook dikecualikan.
- Validasi Zod ketat, regex pencarian di-escape, field input dipetakan sebelum query/update.
- Helmet: CSP, HSTS produksi, `frame-ancestors 'none'`; batas JSON 100 KB; rate limit MongoDB bersama per IP/akun.
- Log terstruktur dengan redaksi cookie, token, Server Key, alamat, payload; ID korelasi di respons dan audit.
- Tidak ada upload file. URL gambar dibatasi relatif/HTTPS dan alt wajib saat publikasi.

## Pengujian

### Perintah

```bash
npm run lint
npm run typecheck
npm run build
npm test                  # integrasi API, MongoDB replica set in-memory
npx playwright install chromium
npm run test:e2e          # browser; build web + API dengan database sementara
```

`npm test` memakai `mongodb-memory-server` (unduhan MongoDB pertama kali) dan **bukan** Docker. Tes browser membuat build web, memakai adapter simulasi dan database sementara, lalu berhenti. Kosongkan port 4100 sebelum menjalankan E2E. Frontend dan API disajikan dari origin yang sama, tanpa Vite dev server. Pipeline CI di `.github/workflows/ci.yml` menjalankan lint, typecheck, build, tes integrasi replica set, dan tes browser pada Node 22.

### Hasil terakhir di workspace ini

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run lint` | Lulus |
| `npm run typecheck` | Lulus (API + web) |
| `npm run build` | Lulus (API + web) |
| `npm audit` | 0 vulnerabilities |
| `npm test` | **51 tes / 7 file lulus** |
| `npm run test:e2e` | **6 tes browser lulus** |
| Visual 1440 px | Beranda, katalog, produk diperiksa |
| Visual 390 px | Beranda dan katalog diperiksa |
| 320 px | Tidak ada overflow horizontal pada beranda/katalog |
| Midtrans sandbox merchant | **Belum dijalankan** (butuh akun & kredensial) |
| UAT operator | **Belum dilakukan** |

Rincian tes integrasi: katalog/filter/facet, draft/arsip, detail varian, ongkir campuran, tarif tidak lengkap, alamat luar zona, manipulasi harga/ongkir field tambahan, quote berubah, snapshot, idempotensi sama/berbeda, dua checkout stok terakhir, CSRF/origin, akses lintas akun, reset sekali pakai + pencabutan sesi, MFA/peran, webhook palsu, status body diabaikan, nominal berbeda, duplikat, event tidak berurutan, capture fraud, refund tanpa pengembalian stok, timeout + rekonsiliasi, pesanan menggantung tanpa percobaan bayar, Snap kedaluwarsa vs metode, 404 ambigu, pembayaran setelah stok dilepas, pemenuhan admin, hold, stok di bawah komitmen, publikasi tidak lengkap, sitemap/robots, dan event analitik tanpa PII.

Tes browser: satu alur penuh varian → keranjang → login → quote → simulasi bayar → status lunas dari backend; panel filter mobile mengembalikan fokus; grid dua kolom; tidak ada overflow 320 px; tangkapan visual.

**Laporan terpisah:** semua angka di atas berasal dari adapter simulasi/`TestGateway` dan replica set in-memory. Belum ada hasil pengujian merchant Midtrans sandbox atau produksi.

## Sebelum rilis

Keputusan yang masih perlu diselesaikan pemilik bisnis/operasional:

| Area | Yang harus diputuskan |
| --- | --- |
| Merek & konten | Nama final, logo, domain, foto berlisensi, SKU/harga/spesifikasi resmi |
| Pengiriman | Zona/tarif disetujui, aturan keranjang campuran, batas dimensi, estimasi |
| Midtrans | Kanal aktif, expiry per kanal, prosedur rekonsiliasi/refund, kredensial produksi |
| Email | Penyedia email transaksional + template; mode `file` hanya dev |
| Kebijakan | Retur, garansi, privasi, retensi, pajak/biaya, kontak dukungan |
| Keamanan | Pemulihan MFA admin, rotasi kunci, akses operator, review audit |
| Operasional | Pemilik kasus, target respons, backup/restore, alert, runbook insiden |
| Kualitas | UAT operator, uji merchant sandbox, uji beban, audit WCAG 2.2 AA menyeluruh |

Belum diimplementasikan: checkout tamu, wishlist, ulasan, promo, integrasi kurir/tarif live, multi-gudang, pre-order, penjemputan barang retur, refund otomatis dari panel, dan unggah foto admin. Pengajuan retur/refund melalui tiket sudah tersedia; persetujuan tidak otomatis mengubah dana atau stok. Lihat [panduan portofolio](docs/PORTFOLIO.md) untuk rincian.

## Troubleshooting

- **`Transaction numbers are only allowed on a replica set`** — MongoDB belum replica set. Jalankan ulang `rs.initiate` atau perbaiki `MONGODB_URI`.
- **Layanan MongoDB lokal standalone di 27017** — jangan arahkan `MONGODB_URI` ke layanan standalone; transaksi akan gagal. Compose proyek ini memakai port 27018 untuk menghindari bentrok.
- **`server selection timeout`** — MongoDB belum siap/URI salah; cek `docker compose ps` dan log `mongo-init`.
- **`MFA_ENCRYPTION_KEY` error** — isi 32 byte base64; setelah mengganti kunci, seed ulang admin demo.
- **Admin tidak punya MFA** — gunakan `npm run seed` (demo) atau bootstrap admin. Login admin tanpa MFA sengaja ditolak.
- **CSRF/Origin 403** — pastikan `APP_ORIGIN` sama dengan origin browser dan cookie `teduh_csrf` ada; jangan memanggil API langsung dari port berbeda tanpa `ALLOWED_ORIGINS`.
- **Tidak ada email reset** — mode `file` menulis ke `apps/api/var/mail`; mode `memory` untuk tes. Penyedia email belum diintegrasikan.
- **Playwright tidak menemukan browser** — `npx playwright install chromium`.
- **Server E2E port bentrok** — kosongkan port 4100 sebelum `npm run test:e2e`; Playwright tidak memakai server yang sudah berjalan. Gunakan Node 22 untuk menyamakan runtime dengan CI.

## Aset dan lisensi

- Ilustrasi SVG di `apps/web/public/images` dan `favicon.svg` dibuat khusus untuk demo ini; hak pakai mengikuti proyek. Ganti dengan foto berlisensi sebelum rilis.
- Font Fraunces dan DM Sans dimuat dari paket `@fontsource` (SIL Open Font License).
