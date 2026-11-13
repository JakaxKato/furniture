import { expect, test } from "@playwright/test";

test("pencarian, menu seluler, dan keranjang koleksi menggunakan data yang sama", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Cari produk", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Temukan untuk ruangmu" });
  await search
    .getByLabel("Nama produk, material, atau jenis furnitur")
    .fill("Veroliving");
  await search.getByRole("button", { name: "Cari", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "1 produk" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Veroliving Coffee Table/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Veroliving Coffee Table",
  );
  await expect(page.locator(".gallery__main img")).toBeVisible();
  expect(
    await page
      .locator(".gallery__main img")
      .evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Tambahkan ke keranjang", exact: true })
    .click();
  const bagButton = page.getByRole("button", { name: /Buka keranjang/ });
  await bagButton.click();
  const bag = page.getByRole("dialog", { name: /Keranjangmu/ });
  await expect(bag).toBeVisible();
  await bag.getByRole("button", { name: /Tambah kuantitas/ }).click();
  await expect(bag.getByText(/10\.980\.000/).first()).toBeVisible();
  await page.screenshot({ path: "test-results/visual/cart-drawer-390.png" });
  await page.keyboard.press("Escape");
  await expect(bagButton).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Buka keranjang, 2 item" }).click();
  await bag.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(bag.getByText("Keranjangmu masih kosong.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Buka menu" }).click();
  await page
    .getByRole("navigation", { name: "Menu seluler" })
    .getByRole("link", { name: "Jurnal" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Cerita kecil.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
