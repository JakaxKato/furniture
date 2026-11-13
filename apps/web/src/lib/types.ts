export type Category = 'kasur' | 'bantal' | 'furnitur';

export type User = {
  id: string;
  email: string;
  name: string;
  role: 'customer' | 'admin_catalog' | 'admin_ops' | 'admin_finance' | 'super_admin';
  phone: string | null;
};

export type StoreArea = {
  name: string;
  province: string;
  cities: string[];
  postalPrefixes: string[];
};

export type StoreConfig = {
  brand: {
    name: string;
    legalName: string;
    tagline: string;
    description: string;
    domain: string;
  };
  contact: { email: string; whatsapp: string; hours: string; address: string };
  serviceAreas: string[];
  policies: Record<string, { title: string; body: string; confirmed: boolean }>;
  featuredProductSlug: string;
  paymentChannels: string[];
  demoMode: boolean;
  demoNotice: string | null;
  paymentAdapter: 'simulation' | 'midtrans';
  areas: StoreArea[];
};

export type ProductImage = { url: string; alt: string };

export type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  categoryLabel: string;
  summary: string;
  images: ProductImage[];
  minPrice: number;
  maxPrice: number;
  inStock: boolean;
  matchedVariantCount: number;
};

export type ProductListResponse = {
  items: ProductSummary[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  priceRange: { min: number; max: number } | null;
};

export type Variant = {
  id: string;
  sku: string;
  label: string;
  price: number;
  shippingClass: Category;
  attributes: Record<string, string | number | null>;
  images: ProductImage[];
  available: number;
  inStock: boolean;
};

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  categoryLabel: string;
  summary: string;
  description: string;
  care: string | null;
  images: ProductImage[];
  variants: Variant[];
  minPrice: number;
  maxPrice: number;
  inStock: boolean;
};

export type FacetGroup = {
  size: string[];
  firmness: string[];
  thickness: number[];
  fill: string[];
  height: number[];
  material: string[];
  finish: string[];
  width: number[];
};

export type FacetsResponse = {
  categories: Array<{ value: Category; label: string }>;
  filters: Record<Category, FacetGroup>;
  priceRange: { min: number; max: number } | null;
};

export type Address = {
  recipient: string;
  phone: string;
  street: string;
  district?: string;
  city: string;
  province: string;
  postalCode: string;
  notes?: string;
};

export type QuoteLine = {
  sku: string;
  productId: string;
  variantId: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  imageUrl: string | null;
  imageAlt: string | null;
  attributes: Record<string, string | number>;
  shippingClass: Category;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  available: number;
  inStock: boolean;
  issue: string | null;
};

export type Quote = {
  items: QuoteLine[];
  address: Address;
  subtotal: number;
  shipping: {
    zoneId: string;
    zoneCode: string;
    zoneName: string;
    zoneVersion: number;
    classes: Array<{ shippingClass: string; label: string; amount: number }>;
    total: number;
    estimatedDays: { min: number; max: number; confirmed: boolean } | null;
  };
  totals: { subtotal: number; shipping: number; grandTotal: number };
  quoteHash: string;
  payable: boolean;
  issues: Array<{ code: string; sku?: string; message: string; available?: number; requested?: number }>;
};

export type PaymentInfo = {
  redirectUrl: string | null;
  status: string;
  uncertain: boolean;
  pending: boolean;
};

export type OrderListResponse = {
  items: Array<{
    orderNumber: string;
    createdAt: string;
    itemCount: number;
    items: Array<{
      productName: string;
      variantLabel: string;
      quantity: number;
      lineTotal: number;
      imageUrl: string | null;
      imageAlt: string | null;
    }>;
    totals: { subtotal: number; shipping: number; grandTotal: number };
    paymentStatus: string;
    paymentLabel: string;
    shippingStatus: string;
    shippingLabel: string;
    shippingHold: boolean;
  }>;
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

export type OrderDetail = {
  updatedAt: string;
  customerUpdate: string | null;
  expectedDelivery: string | null;
  trackingUrl: string | null;
  orderNumber: string;
  createdAt: string;
  email: string;
  items: Array<{
    sku: string;
    productSlug: string;
    productName: string;
    variantLabel: string;
    attributes: Record<string, string | number>;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    imageUrl: string | null;
    imageAlt: string | null;
  }>;
  address: Address;
  shipping: {
    zoneName: string;
    zoneVersion: number;
    classes: Array<{ label: string; amount: number }>;
    total: number;
    estimatedDays: { min: number; max: number; confirmed: boolean } | null;
  };
  totals: { subtotal: number; shipping: number; grandTotal: number };
  paymentStatus: string;
  paymentLabel: string;
  canContinuePayment: boolean;
  paymentRedirectUrl: string | null;
  paymentMessage: string | null;
  shippingStatus: string;
  shippingLabel: string;
  shippingHold: { active: boolean; reason: string | null };
  tracking: {
    courier: string | null;
    trackingNumber: string;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null;
  statusHistory: Array<{ at: string; type: string; from: string | null; to: string | null; note: string | null }>;
  paymentAdapter: string;
  reservationActive: boolean;
  reservationExpiresAt: string | null;
};

export type CartItem = {
  sku: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  unitPrice: number;
  imageUrl: string | null;
  imageAlt: string | null;
  quantity: number;
  category: Category;
};
