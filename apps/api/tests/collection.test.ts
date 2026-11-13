import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Inventory, Product } from "../src/models";
import { upgradeCollection } from "../src/seed/upgradeCollection";
import { collectionProducts } from "../src/seed/collection";
import { createProduct, resetDb, teardownDb } from "./helpers";

afterAll(teardownDb);
beforeEach(resetDb);
describe("pembaruan koleksi Ruang Teduh", () => {
  it("mempertahankan inventaris lama dan produk admin, serta aman dijalankan ulang", async () => {
    const legacy = await createProduct({
      sku: "LEGACY",
      slug: "sofa-dua-dudukan-linen",
      stock: 10,
    });
    await Inventory.updateOne({ sku: "LEGACY" }, { held: 2, allocated: 3 });
    const custom = await createProduct({
      sku: "CUSTOM",
      slug: "koleksi-buatan-admin",
      stock: 7,
    });
    expect(await upgradeCollection()).toEqual({
      added: collectionProducts.length,
    });
    expect((await Product.findById(legacy._id))?.status).toBe("archived");
    expect((await Product.findById(custom._id))?.status).toBe("published");
    expect(await Inventory.findOne({ sku: "LEGACY" }).lean()).toMatchObject({
      physical: 10,
      held: 2,
      allocated: 3,
    });
    const firstSku = collectionProducts[0]!.variants[0]!.sku;
    await Inventory.updateOne({ sku: firstSku }, { physical: 4, held: 1 });
    await Product.updateOne(
      { slug: collectionProducts[0]!.slug },
      { name: "Nama diedit admin" },
    );
    expect(await upgradeCollection()).toEqual({ added: 0 });
    expect(await Inventory.findOne({ sku: firstSku }).lean()).toMatchObject({
      physical: 4,
      held: 1,
    });
    expect(
      (await Product.findOne({ slug: collectionProducts[0]!.slug }))?.name,
    ).toBe("Nama diedit admin");
    expect(await Product.countDocuments()).toBe(collectionProducts.length + 2);
    expect(await Inventory.countDocuments()).toBe(
      collectionProducts.reduce((sum, p) => sum + p.variants.length, 2),
    );
  });
});
