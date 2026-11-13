import mongoose from "mongoose";
import { Product, Inventory } from "../models";
import { collectionProducts, legacyDemoSlugs } from "./collection";

/** Add the new assortment without resetting users, transactions, stock, or edited products. */
export async function upgradeCollection() {
  let added = 0;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      added = 0;
      for (const entry of collectionProducts) {
        if (await Product.exists({ slug: entry.slug }).session(session))
          continue;
        const [product] = await Product.create(
          [
            {
              ...entry,
              publishedAt: new Date(Date.now() - added * 86_400_000),
              variants: entry.variants.map(
                ({ stock: _stock, ...variant }) => variant,
              ),
            },
          ],
          { session },
        );
        if (!product) throw new Error("Produk koleksi gagal dibuat.");
        await Inventory.insertMany(
          product.variants.map((variant, index) => ({
            sku: variant.sku,
            productId: product._id,
            variantId: variant._id,
            physical: entry.variants[index]?.stock ?? 0,
            held: 0,
            allocated: 0,
          })),
          { session },
        );
        added++;
      }
      await Product.updateMany(
        { slug: { $in: legacyDemoSlugs }, status: "published" },
        { $set: { status: "archived" } },
        { session },
      );
    });
    return { added };
  } finally {
    await session.endSession();
  }
}
