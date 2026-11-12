import { test } from '@playwright/test';

test.describe('pemeriksaan visual', () => {
  test('beranda 1440 dan 390', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/visual/home-1440.png', fullPage: true });
    await page.screenshot({ path: 'test-results/visual/home-1440-fold.png' });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/visual/home-390.png', fullPage: true });
    await page.screenshot({ path: 'test-results/visual/home-390-fold.png' });
  });

  test('katalog 1440 dan 390', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/katalog');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/visual/catalog-1440.png', fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/katalog');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/visual/catalog-390.png', fullPage: true });
  });

  test('halaman produk 1440', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/produk/sofa-dua-dudukan-linen');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/visual/product-1440.png', fullPage: true });
  });
});
