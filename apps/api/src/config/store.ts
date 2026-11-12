import { env } from './env';

export const CATEGORIES = ['kasur', 'bantal', 'furnitur'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  kasur: 'Kasur',
  bantal: 'Bantal',
  furnitur: 'Furnitur',
};

export const SHIPPING_CLASSES = ['kasur', 'bantal', 'furnitur'] as const;
export type ShippingClass = (typeof SHIPPING_CLASSES)[number];

export const SHIPPING_CLASS_LABELS: Record<ShippingClass, string> = {
  kasur: 'Kasur',
  bantal: 'Bantal',
  furnitur: 'Furnitur',
};

export type StoreConfig = {
  brand: {
    name: string;
    legalName: string;
    tagline: string;
    description: string;
    domain: string;
  };
  contact: {
    email: string;
    whatsapp: string;
    hours: string;
    address: string;
  };
  serviceAreas: string[];
  policies: {
    shipping: { title: string; body: string; confirmed: boolean };
    returns: { title: string; body: string; confirmed: boolean };
    warranty: { title: string; body: string; confirmed: boolean };
    privacy: { title: string; body: string; confirmed: boolean };
  };
  featuredProductSlug: string;
  demoNotice: string;
};

/**
 * Identitas, kontak, cakupan layanan, dan kebijakan publik.
 * Nilai di bawah ini adalah data demo. Ganti melalui variabel lingkungan
 * atau ubah berkas ini sebelum rilis. Kebijakan berstatus `confirmed: false`
 * tidak dirender di storefront.
 */
export const storeConfig: StoreConfig = {
  brand: {
    name: 'Teduh',
    legalName: 'Teduh Living (data demo)',
    tagline: 'Kasur, bantal, dan furnitur dengan ukuran yang jelas.',
    description:
      'Katalog kasur, bantal, dan furnitur dengan dimensi dalam sentimeter, bahan yang tercantum, dan ketersediaan per varian.',
    domain: 'teduh.example',
  },
  contact: {
    email: 'halo@teduh.example',
    whatsapp: '+62 812-0000-0000',
    hours: 'Senin–Jumat, 09.00–17.00 WIB (contoh)',
    address: 'Alamat gudang demo, Jakarta',
  },
  serviceAreas: ['Jakarta', 'Bandung', 'Surabaya', 'Denpasar'],
  policies: {
    shipping: {
      title: 'Pengiriman',
      body: 'Ongkir dihitung di server berdasarkan kode pos, zona aktif, dan kelas kirim setiap SKU. Estimasi hari hanya ditampilkan bila tarifnya sudah ditandai terkonfirmasi.',
      confirmed: true,
    },
    returns: {
      title: 'Retur',
      body: 'Naskah retur belum disetujui bisnis.',
      confirmed: false,
    },
    warranty: {
      title: 'Garansi',
      body: 'Naskah garansi belum disetujui bisnis.',
      confirmed: false,
    },
    privacy: {
      title: 'Privasi',
      body: 'Naskah kebijakan privasi belum disetujui bisnis.',
      confirmed: false,
    },
  },
  featuredProductSlug: 'sofa-dua-dudukan-linen',
  demoNotice:
    'Situs demo. Produk, harga, tarif, dan kontak adalah contoh dan bukan penawaran aktif.',
};

export type ZoneSeed = {
  code: string;
  name: string;
  province: string;
  cities: string[];
  postalPrefixes: string[];
  rates: Array<{
    shippingClass: ShippingClass;
    price: number;
    etaMinDays?: number;
    etaMaxDays?: number;
    etaConfirmed: boolean;
  }>;
};

/**
 * Tarif awal yang di-seed ke database. Setelah seed, admin dapat mengubah
 * tarif melalui panel; setiap perubahan menaikkan versi aturan.
 * Tarif ini adalah contoh demo dan wajib disetujui operasional sebelum rilis.
 */
export const shippingSeeds: ZoneSeed[] = [
  {
    code: 'JKT',
    name: 'DKI Jakarta',
    province: 'DKI Jakarta',
    cities: ['Jakarta Pusat', 'Jakarta Selatan', 'Jakarta Barat', 'Jakarta Timur', 'Jakarta Utara'],
    postalPrefixes: ['10', '11', '12', '13', '14'],
    rates: [
      { shippingClass: 'kasur', price: 150_000, etaMinDays: 2, etaMaxDays: 4, etaConfirmed: true },
      { shippingClass: 'bantal', price: 35_000, etaMinDays: 1, etaMaxDays: 2, etaConfirmed: true },
      { shippingClass: 'furnitur', price: 275_000, etaMinDays: 3, etaMaxDays: 6, etaConfirmed: true },
    ],
  },
  {
    code: 'BDG',
    name: 'Bandung Raya',
    province: 'Jawa Barat',
    cities: ['Bandung', 'Cimahi'],
    postalPrefixes: ['40'],
    rates: [
      { shippingClass: 'kasur', price: 185_000, etaMinDays: 3, etaMaxDays: 5, etaConfirmed: true },
      { shippingClass: 'bantal', price: 45_000, etaMinDays: 2, etaMaxDays: 3, etaConfirmed: true },
      { shippingClass: 'furnitur', price: 350_000, etaMinDays: 4, etaMaxDays: 7, etaConfirmed: true },
    ],
  },
  {
    code: 'SBY',
    name: 'Surabaya',
    province: 'Jawa Timur',
    cities: ['Surabaya'],
    postalPrefixes: ['60'],
    rates: [
      { shippingClass: 'kasur', price: 250_000, etaConfirmed: false },
      { shippingClass: 'bantal', price: 55_000, etaConfirmed: false },
      { shippingClass: 'furnitur', price: 450_000, etaConfirmed: false },
    ],
  },
  {
    code: 'DPS',
    name: 'Denpasar',
    province: 'Bali',
    cities: ['Denpasar'],
    postalPrefixes: ['80'],
    rates: [
      { shippingClass: 'kasur', price: 350_000, etaConfirmed: false },
      { shippingClass: 'bantal', price: 75_000, etaConfirmed: false },
      // Tarif furnitur sengaja belum tersedia agar alur SHIPPING_UNAVAILABLE dapat diuji.
    ],
  },
];

export const paymentChannels = (env.PAYMENT_CHANNELS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

export const publicConfig = {
  brand: storeConfig.brand,
  contact: storeConfig.contact,
  serviceAreas: storeConfig.serviceAreas,
  policies: Object.fromEntries(
    Object.entries(storeConfig.policies).filter(([, policy]) => policy.confirmed),
  ),
  featuredProductSlug: storeConfig.featuredProductSlug,
  paymentChannels,
  demoMode: env.DEMO_MODE,
  demoNotice: env.DEMO_MODE ? storeConfig.demoNotice : null,
  paymentAdapter: env.PAYMENT_ADAPTER,
};
