import { expect, test } from '@playwright/test';

test.describe('alur pembelian pelanggan', () => {
  test('dari memilih varian sampai status lunas dibaca dari backend', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/katalog?category=kasur');
    await expect(page.getByRole('heading', { name: 'Katalog', level: 1 })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '3 produk' })).toBeVisible();

    await page.getByRole('link', { name: /Kasur Busa Satu Lapis/ }).click();
    await expect(page.getByRole('heading', { name: 'Kasur Busa Satu Lapis', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: '160 × 200 cm' }).click();
    await expect(page.locator('.product-info__price')).toContainText('2.950.000');
    await expect(page.locator('.stock-line')).toContainText('Tersedia');

    await page.getByRole('button', { name: 'Tambahkan ke keranjang' }).click();
    await expect(page.getByRole('status').filter({ hasText: /ditambahkan ke keranjang/ })).toBeVisible();

    await page.locator('.header__cart').click();
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

    await expect(page.getByRole('heading', { name: 'Ringkasan dari server' })).toBeVisible();
    await expect(page.getByText(/3\.100\.000/).first()).toBeVisible();
    await expect(page.getByText(/Ongkir Kasur/)).toBeVisible();

    await page.getByRole('button', { name: 'Bayar sekarang' }).click();
    await page.waitForURL(/\/pembayaran-simulasi\//);
    await expect(page.getByText('Pembayaran simulasi')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Pesanan / })).toBeVisible();
    await page.getByRole('button', { name: 'Simulasikan pembayaran diterima' }).click();

    await page.waitForURL(/\/akun\/pesanan\//);
    await expect(page.getByText('Pembayaran diterima').first()).toBeVisible();
    await expect(page.getByText('Belum diproses').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pembayaran diterima' })).toHaveCount(0);
    await expect(page.getByText('Pembayaran sedang ditinjau')).toHaveCount(0);
  });
});

test.describe('katalog responsif dan aksesibilitas filter', () => {
  test('panel filter mengembalikan fokus saat ditutup dan grid dua kolom di ponsel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/katalog');
    const filterButton = page.getByRole('button', { name: /^Filter/ });
    await expect(filterButton).toBeVisible();
    await filterButton.click();
    const dialog = page.getByRole('dialog');
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
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `overflow horizontal di ${path}`).toBeLessThanOrEqual(1);
    }
  });
});
