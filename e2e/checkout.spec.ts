import { expect, test } from '@playwright/test';
import { authenticator } from 'otplib';

test.describe('alur pembelian pelanggan', () => {
  test('pembelian, persiapan admin, tiket bantuan, dan notifikasi pembeli', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/katalog?q=Serenity');
    await expect(page.getByRole('heading', { name: 'Katalog', level: 1 })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '1 produk' })).toBeVisible();

    await page.getByRole('link', { name: /Serenity Lounge Chair & Ottoman/ }).click();
    await expect(page.getByRole('heading', { name: 'Serenity Lounge Chair & Ottoman', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /^Walnut & karamel/ }).click();
    await expect(page.locator('.product-info__price')).toContainText('7.290.000');
    await expect(page.locator('.stock-line')).toContainText('Tersedia');

    await page.getByRole('button', { name: 'Tambahkan ke keranjang' }).click();
    await expect(page.getByRole('status').filter({ hasText: /ditambahkan ke keranjang/ })).toBeVisible();

    await page.getByRole('button', { name: /Buka keranjang/ }).click();
    await expect(page.getByRole('dialog', { name: /Keranjangmu/ })).toBeVisible();
    await page.getByRole('dialog').getByRole('link', { name: 'Lihat keranjang', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Keranjang', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Lanjut ke checkout' }).click();
    await expect(page.getByRole('heading', { name: 'Masuk untuk melanjutkan.' })).toBeVisible();
    await page.locator('#konten').getByRole('link', { name: 'Masuk', exact: true }).click();

    await page.getByLabel('Email').fill('pelanggan@teduh.example');
    await page.getByLabel('Kata sandi').fill('Pelanggan123');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByRole('heading', { name: 'Konfirmasi pesanan' })).toBeVisible();

    await page.getByLabel('Nama penerima').fill('Sari Demo');
    await page.getByLabel('Nomor telepon').fill('+6281200000001');
    await page.getByLabel('Alamat jalan dan nomor').fill('Jalan Demo No. 10');
    await page.getByLabel('Kota / kabupaten').selectOption('Jakarta Selatan');
    await page.getByLabel('Kode pos').fill('12140');
    await expect(page.getByLabel('Provinsi')).toHaveValue('DKI Jakarta');
    await page.getByRole('button', { name: 'Cek ongkir' }).click();

    await expect(page.getByRole('heading', { name: /Tinjau pesanan/  })).toBeVisible();
    await expect(page.getByText(/7\.565\.000/).first()).toBeVisible();
    await expect(page.getByText(/Ongkir Furnitur/)).toBeVisible();

    const checkoutImage = await page.locator('.checkout-summary__media img').boundingBox();
    expect(checkoutImage!.height).toBeLessThan(80);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: 'test-results/visual/checkout-1440.png', fullPage: true });
    await page.getByRole('button', { name: 'Bayar sekarang' }).click();
    await page.waitForURL(/\/pembayaran-simulasi\//);
    await expect(page.getByText('Pembayaran simulasi')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Pesanan / })).toBeVisible();
    await page.getByRole('button', { name: 'Simulasikan pembayaran diterima' }).click();

    await page.waitForURL(/\/akun\/pesanan\//);
    await expect(page.getByText('Pembayaran diterima').first()).toBeVisible();
    await expect(page.getByText('Belum diproses').first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Pembayaran diterima, pesanan sedang disiapkan', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Pembayaran sedang ditinjau')).toHaveCount(0);
    const orderNumber = new URL(page.url()).pathname.split('/').pop()!;
    await page.getByRole('link', { name: 'Bantuan / retur / refund' }).click();
    await page.getByLabel('Judul', { exact: true }).fill('Konfirmasi jadwal pengiriman');
    await page.getByLabel('Jelaskan kendala').fill('Mohon kirim setelah pukul sembilan pagi.');
    await page.getByRole('button', { name: 'Kirim pengajuan' }).click();
    await expect(page.getByRole('heading', { name: 'Konfirmasi jadwal pengiriman' })).toBeVisible();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto('http://localhost:4100/admin/masuk');
    await adminPage.getByLabel('Email admin').fill('admin@teduh.example');
    await adminPage.getByLabel('Kata sandi').fill('AdminDemo123');
    await adminPage.getByLabel('Kode MFA (6 digit)').fill(authenticator.generate('JBSWY3DPEHPK3PXP'));
    await adminPage.getByRole('button', { name: 'Masuk panel admin' }).click();
    await expect(adminPage.getByRole('heading', { name: 'Antrean tindakan' })).toBeVisible();
    await expect(adminPage.getByRole('link', { name: orderNumber, exact: true })).toBeVisible();
    await adminPage.screenshot({ path: 'test-results/visual/admin-operations.png', fullPage: true });
    await adminPage.setViewportSize({ width: 390, height: 844 });
    expect(await adminPage.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await adminPage.screenshot({ path: 'test-results/visual/admin-390.png', fullPage: true });
    await adminPage.setViewportSize({ width: 1280, height: 900 });
    await adminPage.getByRole('link', { name: orderNumber, exact: true }).click();
    await adminPage.getByLabel('Penanggung jawab', { exact: true }).selectOption({ label: 'Admin Demo' });
    await adminPage.getByLabel('Barang diambil sesuai SKU dan jumlah').check();
    await adminPage.getByLabel('Kemasan selesai').check();
    await adminPage.getByLabel('Kondisi dan kelengkapan diperiksa').check();
    await adminPage
      .getByLabel('Informasi yang ditampilkan ke pembeli')
      .fill('Pesanan telah dikemas. Pengiriman dijadwalkan besok pagi.');
    await adminPage.getByRole('button', { name: 'Simpan pembaruan' }).click();
    await expect(adminPage.getByText('Persiapan dan informasi pembeli diperbarui.')).toBeVisible();
    await adminPage.goto('http://localhost:4100/admin/layanan');
    await adminPage
      .getByLabel('Balasan untuk pembeli / alasan keputusan')
      .fill('Baik, pengiriman dijadwalkan setelah pukul sembilan.');
    await adminPage.getByRole('button', { name: 'Ambil tanggung jawab & kirim' }).click();
    await expect(adminPage.getByText('Baik, pengiriman dijadwalkan setelah pukul sembilan.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Baik, pengiriman dijadwalkan setelah pukul sembilan.')).toBeVisible();
    await page.goto('/akun/notifikasi');
    await expect(page.getByText('Pesanan telah dikemas. Pengiriman dijadwalkan besok pagi.')).toBeVisible();
    await page.getByRole('button', { name: 'Tandai telah dibaca' }).click();
    await expect(page.getByRole('button', { name: 'Tandai telah dibaca' })).toBeDisabled();
    await page.goto(`/akun/pesanan/${orderNumber}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.order-items__media img')).toBeVisible();
    const thumbnail = await page.locator('.order-items__media img').boundingBox();
    expect(thumbnail!.height).toBeLessThan(80);
    await page.screenshot({ path: 'test-results/visual/customer-order-390.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(
      1,
    );
    await adminContext.close();
  });
});

test.describe('katalog responsif dan aksesibilitas filter', () => {
  test('panel filter mengembalikan fokus saat ditutup dan grid dua kolom di ponsel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/katalog');
    const filterButton = page.getByRole('button', { name: /^Filter/ });
    await expect(filterButton).toBeVisible();
    await filterButton.click();
    const dialog = page.getByRole('dialog', { name: /Filter/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Cari produk')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(filterButton).toBeFocused();

    const cards = page.locator('.product-card');
    await expect(cards.first()).toBeVisible();
    const boxes = await cards.evaluateAll((elements) =>
      elements.slice(0, 3).map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, left: rect.left };
      }),
    );
    expect(boxes[0]!.top).toBeCloseTo(boxes[1]!.top, 0);
    expect(boxes[2]!.top).toBeGreaterThan(boxes[0]!.top);
    expect(boxes[0]!.left).not.toBe(boxes[1]!.left);
  });

  test('tidak ada overflow horizontal pada 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 760 });
    for (const path of ['/', '/katalog']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `overflow horizontal di ${path}`).toBeLessThanOrEqual(1);
    }
  });
});
