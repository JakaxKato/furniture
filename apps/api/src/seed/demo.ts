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

type SeedVariant = {
  sku: string;
  label: string;
  price: number;
  shippingClass: 'kasur' | 'bantal' | 'furnitur';
  attributes: Record<string, string | number>;
  stock: number;
  images?: Array<{ url: string; alt: string }>;
};

type SeedProduct = {
  slug: string;
  name: string;
  category: 'kasur' | 'bantal' | 'furnitur';
  summary: string;
  description: string;
  care: string;
  images: Array<{ url: string; alt: string }>;
  status: 'draft' | 'published' | 'archived';
  variants: SeedVariant[];
};

const P = '/images/products';

const products: SeedProduct[] = [
  {
    slug: 'kasur-serat-kelapa',
    name: 'Kasur Serat Kelapa',
    category: 'kasur',
    summary: 'Inti serat kelapa dengan lapisan busa; tinggi total 15 cm. Empat ukuran.',
    description:
      'Kasur dengan inti serat kelapa dan lapisan busa di kedua sisi. Tinggi total 15 cm. Tersedia ukuran 90 × 200 cm hingga 180 × 200 cm. Rangka tempat tidur tidak termasuk.',
    care: 'Balik sisi kasur setiap tiga bulan. Gunakan pelindung kasur dan hindari paparan air langsung.',
    images: [
      {
        url: `${P}/kasur-serat-kelapa.svg`,
        alt: 'Ilustrasi kasur serat kelapa dengan penutup kain krem di atas rangka kayu rendah',
      },
    ],
    status: 'published',
    variants: [
      {
        sku: 'KSR-KLP-090',
        label: '90 × 200 cm',
        price: 1_850_000,
        shippingClass: 'kasur',
        attributes: { size: '90 × 200 cm', firmness: 'Keras', thicknessCm: 15 },
        stock: 6,
      },
      {
        sku: 'KSR-KLP-120',
        label: '120 × 200 cm',
        price: 2_150_000,
        shippingClass: 'kasur',
        attributes: { size: '120 × 200 cm', firmness: 'Keras', thicknessCm: 15 },
        stock: 4,
      },
      {
        sku: 'KSR-KLP-160',
        label: '160 × 200 cm',
        price: 2_650_000,
        shippingClass: 'kasur',
        attributes: { size: '160 × 200 cm', firmness: 'Keras', thicknessCm: 15 },
        stock: 3,
      },
      {
        sku: 'KSR-KLP-180',
        label: '180 × 200 cm',
        price: 2_950_000,
        shippingClass: 'kasur',
        attributes: { size: '180 × 200 cm', firmness: 'Keras', thicknessCm: 15 },
        stock: 0,
      },
    ],
  },
  {
    slug: 'kasur-busa-kepadatan-tinggi',
    name: 'Kasur Busa Satu Lapis',
    category: 'kasur',
    summary: 'Busa satu lapis setebal 20 cm dengan penutup kain. Tiga ukuran.',
    description:
      'Kasur busa satu lapis dengan tinggi total 20 cm dan penutup kain yang dapat dilepas. Tersedia ukuran 120 × 200 cm, 160 × 200 cm, dan 180 × 200 cm. Rangka tempat tidur tidak termasuk.',
    care: 'Bersihkan penutup dengan sikat lembut dan deterjen ringan. Jemur penutup di tempat teduh.',
    images: [
      {
        url: `${P}/kasur-busa.svg`,
        alt: 'Ilustrasi kasur busa tebal 20 cm dengan seprai putih tulang',
      },
    ],
    status: 'published',
    variants: [
      {
        sku: 'KSR-BUS-120',
        label: '120 × 200 cm',
        price: 2_350_000,
        shippingClass: 'kasur',
        attributes: { size: '120 × 200 cm', firmness: 'Sedang', thicknessCm: 20 },
        stock: 4,
      },
      {
        sku: 'KSR-BUS-160',
        label: '160 × 200 cm',
        price: 2_950_000,
        shippingClass: 'kasur',
        attributes: { size: '160 × 200 cm', firmness: 'Sedang', thicknessCm: 20 },
        stock: 2,
      },
      {
        sku: 'KSR-BUS-180',
        label: '180 × 200 cm',
        price: 3_350_000,
        shippingClass: 'kasur',
        attributes: { size: '180 × 200 cm', firmness: 'Sedang', thicknessCm: 20 },
        stock: 1,
      },
    ],
  },
  {
    slug: 'kasur-pegas-bersaku',
    name: 'Kasur Pegas Bersaku',
    category: 'kasur',
    summary: 'Lapisan pegas bersaku dengan busa di atasnya; tinggi total 25 cm.',
    description:
      'Kasur dengan lapisan pegas bersaku dan lapisan busa di permukaan. Tinggi total 25 cm. Tersedia ukuran 160 × 200 cm dan 180 × 200 cm.',
    care: 'Gunakan alas kasur yang rata. Hindari melompat di atas kasur. Balik posisi kepala dan kaki setiap enam bulan.',
    images: [
      {
        url: `${P}/kasur-pegas.svg`,
        alt: 'Ilustrasi kasur pegas bersaku dengan penutup kain abu hangat',
      },
    ],
    status: 'published',
    variants: [
      {
        sku: 'KSR-PGS-160',
        label: '160 × 200 cm',
        price: 4_250_000,
        shippingClass: 'kasur',
        attributes: { size: '160 × 200 cm', firmness: 'Sedang', thicknessCm: 25 },
        stock: 2,
      },
      {
        sku: 'KSR-PGS-180',
        label: '180 × 200 cm',
        price: 4_750_000,
        shippingClass: 'kasur',
        attributes: { size: '180 × 200 cm', firmness: 'Sedang', thicknessCm: 25 },
        stock: 1,
      },
    ],
  },
  {
    slug: 'bantal-serat-poliester',
    name: 'Bantal Serat Poliester',
    category: 'bantal',
    summary: 'Isi serat poliester, ukuran 50 × 70 cm, tersedia tinggi 10 cm dan 14 cm.',
    description:
      'Bantal berukuran 50 × 70 cm dengan isi serat poliester dan penutup kain katun. Pilih tinggi 10 cm atau 14 cm sesuai posisi tidur.',
    care: 'Cuci penutup dengan air dingin. Isi bantal dijemur di tempat teduh dan keringkan sepenuhnya.',
    images: [
      {
        url: `${P}/bantal-poliester.svg`,
        alt: 'Ilustrasi dua bantal serat poliester dengan sarung katun putih tulang',
      },
    ],
    status: 'published',
    variants: [
      {
        sku: 'BTL-POL-010',
        label: '50 × 70 cm · tinggi 10 cm',
        price: 185_000,
        shippingClass: 'bantal',
        attributes: { size: '50 × 70 cm', fill: 'Serat poliester', heightCm: 10 },
        stock: 8,
      },
      {
        sku: 'BTL-POL-014',
        label: '50 × 70 cm · tinggi 14 cm',
        price: 215_000,
        shippingClass: 'bantal',
        attributes: { size: '50 × 70 cm', fill: 'Serat poliester', heightCm: 14 },
        stock: 5,
      },
    ],
  },
  {
    slug: 'bantal-lateks',
    name: 'Bantal Lateks',
    category: 'bantal',
    summary: 'Isi lateks alami, ukuran 50 × 70 cm, tinggi 11 cm. Untuk saat ini habis.',
    description:
      'Bantal berukuran 50 × 70 cm dengan isi lateks alami dan penutup kain katun. Tinggi 11 cm. Stok saat ini habis; hubungi kontak resmi untuk informasi ketersediaan.',
    care: 'Jangan direndam. Bersihkan permukaan dengan kain lembap dan angin-anginkan di tempat teduh.',
    images: [
      {
        url: `${P}/bantal-lateks.svg`,
        alt: 'Ilustrasi bantal lateks berwarna krem dengan tekstur kain katun',
      },
    ],
    status: 'published',
    variants: [
      {
        sku: 'BTL-LTX-050',
        label: '50 × 70 cm · tinggi 11 cm',
        price: 495_000,
        shippingClass: 'bantal',
        attributes: { size: '50 × 70 cm', fill: 'Lateks alami', heightCm: 11 },
        stock: 0,
      },
    ],
  },
  {
    slug: 'sofa-dua-dudukan-linen',
    name: 'Sofa Dua Dudukan Linen',
    category: 'furnitur',
    summary: 'Rangka kayu dan penutup linen; lebar 160 cm, kedalaman 85 cm, tinggi 78 cm.',
    description:
      'Sofa dua dudukan dengan rangka kayu, busa duduk, dan penutup linen. Dimensi 160 × 85 × 78 cm (lebar × kedalaman × tinggi). Kaki kayu dapat dilepas saat pengiriman.',
    care: 'Vakum permukaan secara rutin. Bersihkan noda dengan kain lembap; hindari pemaparan sinar matahari langsung.',
    images: [
      {
        url: `${P}/sofa-cream.svg`,
        alt: 'Ilustrasi sofa dua dudukan berwarna krem di ruang dengan dinding zaitun',
      },
      {
        url: `${P}/sofa-olive.svg`,
        alt: 'Ilustrasi sofa dua dudukan berwarna zaitun di ruang putih tulang',
      },
    ],
    status: 'published',
    variants: [
      {
        sku: 'FUR-SOF-KRM',
        label: 'Krem alami',
        price: 6_850_000,
        shippingClass: 'furnitur',
        attributes: { material: 'Linen', finish: 'Krem alami', widthCm: 160, depthCm: 85, heightCm: 78 },
        stock: 1,
        images: [
          {
            url: `${P}/sofa-cream.svg`,
            alt: 'Sofa linen dua dudukan warna krem alami dengan kaki kayu',
          },
        ],
      },
      {
        sku: 'FUR-SOF-ZTN',
        label: 'Zaitun',
        price: 7_150_000,
        shippingClass: 'furnitur',
        attributes: { material: 'Linen', finish: 'Zaitun', widthCm: 160, depthCm: 85, heightCm: 78 },
        stock: 2,
        images: [
          {
            url: `${P}/sofa-olive.svg`,
            alt: 'Sofa linen dua dudukan warna zaitun dengan kaki kayu',
          },
        ],
      },
    ],
  },
  {
    slug: 'kursi-kayu-jati',
    name: 'Kursi Kayu Jati',
    category: 'furnitur',
    summary: 'Kayu jati solid dengan finishing minyak alami; 55 × 52 × 78 cm.',
    description:
      'Kursi tanpa penyangga lengan dari kayu jati solid. Finishing minyak alami. Dimensi 55 × 52 × 78 cm (lebar × kedalaman × tinggi), tinggi dudukan 45 cm.',
    care: 'Lap dengan kain kering. Oleskan minyak kayu setiap 6–12 bulan bila permukaan terlihat kering.',
    images: [
      {
        url: `${P}/kursi-jati.svg`,
        alt: 'Ilustrasi kursi kayu jati dengan finishing minyak alami',
      },
    ],
    status: 'published',
    variants: [
      {
        sku: 'FUR-KRS-JAT',
        label: 'Minyak alami',
        price: 1_950_000,
        shippingClass: 'furnitur',
        attributes: { material: 'Kayu jati', finish: 'Minyak alami', widthCm: 55, depthCm: 52, heightCm: 78 },
        stock: 5,
      },
    ],
  },
  {
    slug: 'meja-samping-kayu',
    name: 'Meja Samping Kayu',
    category: 'furnitur',
    summary: 'Meja samping kayu jati; 45 × 45 × 50 cm.',
    description:
      'Meja samping dari kayu jati dengan satu permukaan datar dan empat kaki. Dimensi 45 × 45 × 50 cm (lebar × kedalaman × tinggi).',
    care: 'Gunakan alas untuk benda panas atau basah. Lap dengan kain kering.',
    images: [
      {
        url: `${P}/meja-samping.svg`,
        alt: 'Ilustrasi meja samping kayu jati berukuran kecil',
      },
    ],
    status: 'published',
    variants: [
      {
        sku: 'FUR-MJS-JAT',
        label: 'Minyak alami',
        price: 1_250_000,
        shippingClass: 'furnitur',
        attributes: { material: 'Kayu jati', finish: 'Minyak alami', widthCm: 45, depthCm: 45, heightCm: 50 },
        stock: 4,
      },
    ],
  },
  {
    slug: 'rak-buku-rendah',
    name: 'Rak Buku Rendah',
    category: 'furnitur',
    summary: 'Kayu pinus dengan cat kapur; 90 × 32 × 60 cm, tiga tingkat.',
    description:
      'Rak buku rendah dari kayu pinus dengan cat kapur dan tiga tingkat terbuka. Dimensi 90 × 32 × 60 cm (lebar × kedalaman × tinggi).',
    care: 'Lap dengan kain lembap. Hindari beban lebih dari 12 kg per tingkat.',
    images: [
      {
        url: `${P}/rak-buku.svg`,
        alt: 'Ilustrasi rak buku rendah kayu pinus dengan tiga tingkat',
      },
    ],
    status: 'published',
    variants: [
      {
        sku: 'FUR-RAK-PIN',
        label: 'Cat kapur',
        price: 1_850_000,
        shippingClass: 'furnitur',
        attributes: { material: 'Kayu pinus', finish: 'Cat kapur', widthCm: 90, depthCm: 32, heightCm: 60 },
        stock: 3,
      },
    ],
  },
  {
    slug: 'bangku-kayu-draf',
    name: 'Bangku Kayu (Draf)',
    category: 'furnitur',
    summary: 'Contoh produk draf yang tidak tampil di katalog.',
    description: 'Produk ini disimpan sebagai draf untuk menguji alur publikasi admin.',
    care: 'Belum disetujui.',
    images: [
      {
        url: `${P}/kursi-jati.svg`,
        alt: 'Ilustrasi bangku kayu untuk data draf',
      },
    ],
    status: 'draft',
    variants: [
      {
        sku: 'FUR-BNK-DRF',
        label: 'Draf',
        price: 950_000,
        shippingClass: 'furnitur',
        attributes: { material: 'Kayu pinus', finish: 'Tanpa finishing', widthCm: 80, depthCm: 35, heightCm: 45 },
        stock: 0,
      },
    ],
  },
  {
    slug: 'meja-makan-arsip',
    name: 'Meja Makan Kayu (Arsip)',
    category: 'furnitur',
    summary: 'Contoh produk arsip yang tidak tampil di katalog.',
    description: 'Produk ini diarsipkan untuk menguji penyembunyian produk arsip.',
    care: 'Tidak berlaku.',
    images: [
      {
        url: `${P}/meja-samping.svg`,
        alt: 'Ilustrasi meja kayu untuk data arsip',
      },
    ],
    status: 'archived',
    variants: [
      {
        sku: 'FUR-MJM-ARS',
        label: 'Arsip',
        price: 3_500_000,
        shippingClass: 'furnitur',
        attributes: { material: 'Kayu jati', finish: 'Minyak alami', widthCm: 140, depthCm: 80, heightCm: 75 },
        stock: 0,
      },
    ],
  },
];

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
