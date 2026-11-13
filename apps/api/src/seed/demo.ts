import argon2 from 'argon2';
import { encryptSecret } from '../lib/crypto';
import { env } from '../config/env';
import { shippingSeeds } from '../config/store';
import {
  AnalyticsEvent,
  AuditLog,
  CheckoutKey,
  Inventory,
  InventoryEntry,
  SupportTicket,
  InboxRead,
  Order,
  PasswordResetToken,
  PaymentAttempt,
  PaymentCase,
  Product,
  RateLimitBucket,
  Session,
  ShippingZone,
  SimulatedTransaction,
  User,
  WebhookEvent,
} from '../models';

import { collectionProducts as products } from './collection';

export type SeedResult = {
  products: number;
  zones: number;
  users: string[];
  adminMfaSecret: string | null;
  adminMfaEnabled: boolean;
};

export async function seedDemoData(): Promise<SeedResult> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Seed demo ditolak di produksi.');
  }

  await Promise.all([
    AnalyticsEvent.deleteMany({}),
    AuditLog.deleteMany({}),
    CheckoutKey.deleteMany({}),
    Inventory.deleteMany({}),
    InventoryEntry.deleteMany({}),
    SupportTicket.deleteMany({}),
    InboxRead.deleteMany({}),
    Order.deleteMany({}),
    PasswordResetToken.deleteMany({}),
    PaymentAttempt.deleteMany({}),
    PaymentCase.deleteMany({}),
    Product.deleteMany({}),
    RateLimitBucket.deleteMany({}),
    Session.deleteMany({}),
    ShippingZone.deleteMany({}),
    SimulatedTransaction.deleteMany({}),
    User.deleteMany({}),
    WebhookEvent.deleteMany({}),
  ]);

  await ShippingZone.insertMany(
    shippingSeeds.map((zone) => ({
      code: zone.code,
      name: zone.name,
      province: zone.province,
      cities: zone.cities,
      postalPrefixes: zone.postalPrefixes,
      rates: zone.rates,
      version: 1,
      active: true,
    })),
  );

  let index = 0;
  for (const entry of products) {
    const product = await Product.create({
      slug: entry.slug,
      name: entry.name,
      category: entry.category,
      summary: entry.summary,
      description: entry.description,
      care: entry.care,
      images: entry.images,
      status: entry.status,
      publishedAt: entry.status === 'published' ? new Date(Date.now() - index * 86_400_000) : undefined,
      variants: entry.variants.map((variant) => ({
        sku: variant.sku,
        label: variant.label,
        price: variant.price,
        shippingClass: variant.shippingClass,
        attributes: variant.attributes,
        images: variant.images ?? [],
      })),
    });
    await Inventory.insertMany(
      product.variants.map((variant, variantIndex) => ({
        sku: variant.sku,
        productId: product._id,
        variantId: variant._id,
        physical: entry.variants[variantIndex]?.stock ?? 0,
        held: 0,
        allocated: 0,
      })),
    );
    index += 1;
  }

  const customerPassword = await argon2.hash('Pelanggan123', {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  await User.create({
    email: 'pelanggan@teduh.example',
    name: 'Sari Demo',
    phone: '+6281200000001',
    passwordHash: customerPassword,
    role: 'customer',
  });

  const demoSecret = 'JBSWY3DPEHPK3PXP';
  let adminMfaEnabled = false;
  if (env.MFA_ENCRYPTION_KEY) {
    const adminPassword = await argon2.hash('AdminDemo123', {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const encrypted = encryptSecret(demoSecret);
    const adminUsers = [
      { email: 'admin@teduh.example', name: 'Admin Demo', role: 'super_admin' as const },
      { email: 'katalog@teduh.example', name: 'Admin Katalog Demo', role: 'admin_catalog' as const },
      { email: 'operasional@teduh.example', name: 'Admin Operasional Demo', role: 'admin_ops' as const },
      { email: 'keuangan@teduh.example', name: 'Admin Keuangan Demo', role: 'admin_finance' as const },
    ];
    for (const admin of adminUsers) {
      await User.create({
        email: admin.email,
        name: admin.name,
        phone: '+6281200000002',
        passwordHash: adminPassword,
        role: admin.role,
        mfaEnabled: true,
        mfaSecret: encrypted,
      });
    }
    adminMfaEnabled = true;
  }

  return {
    products: products.length,
    zones: shippingSeeds.length,
    users: env.MFA_ENCRYPTION_KEY
      ? ['pelanggan@teduh.example', 'admin@teduh.example', 'katalog@teduh.example', 'operasional@teduh.example', 'keuangan@teduh.example']
      : ['pelanggan@teduh.example'],
    adminMfaSecret: env.MFA_ENCRYPTION_KEY ? demoSecret : null,
    adminMfaEnabled,
  };
}

export const DEMO_PASSWORDS = {
  customer: 'Pelanggan123',
  admin: 'AdminDemo123',
};
