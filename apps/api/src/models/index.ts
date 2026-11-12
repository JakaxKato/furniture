import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { CATEGORIES, SHIPPING_CLASSES } from '../config/store';

export const ROLES = ['customer', 'admin_catalog', 'admin_ops', 'admin_finance', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 30 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'customer', required: true },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  },
  { timestamps: true },
);
userSchema.index({ email: 1 }, { unique: true });
export type UserDoc = InferSchemaType<typeof userSchema>;
export const User: Model<UserDoc> = models.User ?? model('User', userSchema);

const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    csrfTokenHash: { type: String, required: true },
    mfaVerified: { type: Boolean, default: false },
    ipHash: { type: String },
    userAgent: { type: String, maxlength: 300 },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type SessionDoc = InferSchemaType<typeof sessionSchema>;
export const Session: Model<SessionDoc> = models.Session ?? model('Session', sessionSchema);

const passwordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
passwordResetSchema.index({ tokenHash: 1 }, { unique: true });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PasswordResetToken: Model<InferSchemaType<typeof passwordResetSchema>> =
  models.PasswordResetToken ?? model('PasswordResetToken', passwordResetSchema);

const imageSchema = new Schema(
  {
    url: { type: String, required: true, maxlength: 500 },
    alt: { type: String, required: true, maxlength: 200 },
  },
  { _id: false },
);

const variantSchema = new Schema(
  {
    sku: { type: String, required: true, uppercase: true, trim: true, maxlength: 64 },
    label: { type: String, required: true, maxlength: 120 },
    price: { type: Number, required: true, min: 0 },
    shippingClass: { type: String, enum: SHIPPING_CLASSES, required: true },
    attributes: {
      size: { type: String, maxlength: 60 },
      firmness: { type: String, maxlength: 60 },
      thicknessCm: { type: Number, min: 0, max: 200 },
      fill: { type: String, maxlength: 80 },
      heightCm: { type: Number, min: 0, max: 500 },
      material: { type: String, maxlength: 80 },
      finish: { type: String, maxlength: 80 },
      widthCm: { type: Number, min: 0, max: 1000 },
      depthCm: { type: Number, min: 0, max: 1000 },
    },
    images: { type: [imageSchema], default: [] },
  },
  { _id: true },
);

const productSchema = new Schema(
  {
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, enum: CATEGORIES, required: true },
    summary: { type: String, required: true, maxlength: 240 },
    description: { type: String, required: true, maxlength: 4000 },
    care: { type: String, maxlength: 1000 },
    images: { type: [imageSchema], default: [] },
    variants: { type: [variantSchema], default: [] },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
    publishedAt: { type: Date },
  },
  { timestamps: true },
);
productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ 'variants.sku': 1 }, { unique: true });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ name: 1 });
export type ProductDoc = InferSchemaType<typeof productSchema>;
export const Product: Model<ProductDoc> = models.Product ?? model('Product', productSchema);

const inventorySchema = new Schema(
  {
    sku: { type: String, required: true, uppercase: true, trim: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    physical: { type: Number, required: true, min: 0, default: 0 },
    held: { type: Number, required: true, min: 0, default: 0 },
    allocated: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);
inventorySchema.index({ sku: 1 }, { unique: true });
inventorySchema.index({ productId: 1 });
export type InventoryDoc = InferSchemaType<typeof inventorySchema>;
export const Inventory: Model<InventoryDoc> = models.Inventory ?? model('Inventory', inventorySchema);

const inventoryEntrySchema = new Schema({
  sku: { type: String, required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  type: { type: String, enum: ['reserve', 'release', 'allocate', 'ship', 'adjust'], required: true },
  quantity: { type: Number, required: true },
  physicalDelta: { type: Number, default: 0 },
  heldDelta: { type: Number, default: 0 },
  allocatedDelta: { type: Number, default: 0 },
  reason: { type: String, maxlength: 500 },
  actorId: { type: Schema.Types.ObjectId, ref: 'User' },
  correlationId: { type: String },
  at: { type: Date, default: Date.now },
});
inventoryEntrySchema.index({ sku: 1, at: -1 });
inventoryEntrySchema.index({ orderId: 1 });
export const InventoryEntry: Model<InferSchemaType<typeof inventoryEntrySchema>> =
  models.InventoryEntry ?? model('InventoryEntry', inventoryEntrySchema);

const shippingRateSchema = new Schema(
  {
    shippingClass: { type: String, enum: SHIPPING_CLASSES, required: true },
    price: { type: Number, required: true, min: 0 },
    etaMinDays: { type: Number, min: 0, max: 60 },
    etaMaxDays: { type: Number, min: 0, max: 60 },
    etaConfirmed: { type: Boolean, default: false },
  },
  { _id: false },
);

const shippingZoneSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
    name: { type: String, required: true, maxlength: 120 },
    province: { type: String, required: true, maxlength: 120 },
    cities: { type: [String], default: [] },
    postalPrefixes: { type: [String], default: [] },
    rates: { type: [shippingRateSchema], default: [] },
    version: { type: Number, default: 1, required: true },
    active: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
shippingZoneSchema.index({ code: 1 }, { unique: true });
shippingZoneSchema.index({ active: 1 });
export type ShippingZoneDoc = InferSchemaType<typeof shippingZoneSchema>;
export const ShippingZone: Model<ShippingZoneDoc> = models.ShippingZone ?? model('ShippingZone', shippingZoneSchema);

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productSlug: { type: String, required: true },
    productName: { type: String, required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    variantLabel: { type: String, required: true },
    sku: { type: String, required: true },
    attributes: { type: Schema.Types.Mixed, default: {} },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
    shippingClass: { type: String, enum: SHIPPING_CLASSES, required: true },
    imageUrl: { type: String },
    imageAlt: { type: String },
  },
  { _id: false },
);

const addressSchema = new Schema(
  {
    recipient: { type: String, required: true, maxlength: 120 },
    phone: { type: String, required: true, maxlength: 30 },
    street: { type: String, required: true, maxlength: 300 },
    district: { type: String, maxlength: 120 },
    city: { type: String, required: true, maxlength: 120 },
    province: { type: String, required: true, maxlength: 120 },
    postalCode: { type: String, required: true, maxlength: 10 },
    notes: { type: String, maxlength: 300 },
  },
  { _id: false },
);

export const PAYMENT_STATUSES = [
  'pending',
  'verifying',
  'paid',
  'failed',
  'expired',
  'cancelled',
  'review',
  'partially_refunded',
  'refunded',
  'disputed',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SHIPPING_STATUSES = ['pending', 'ready', 'shipped', 'delivered'] as const;
export type ShippingStatus = (typeof SHIPPING_STATUSES)[number];

const shippingClassSnapshotSchema = new Schema(
  {
    shippingClass: { type: String, enum: SHIPPING_CLASSES, required: true },
    label: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false },
);

const shippingSnapshotSchema = new Schema(
  {
    zoneId: { type: Schema.Types.ObjectId, ref: 'ShippingZone', required: true },
    zoneCode: { type: String, required: true },
    zoneName: { type: String, required: true },
    zoneVersion: { type: Number, required: true },
    classes: { type: [shippingClassSnapshotSchema], required: true },
    total: { type: Number, required: true },
    estimatedDays: {
      min: Number,
      max: Number,
      confirmed: { type: Boolean, default: false },
    },
  },
  { _id: false },
);

const totalsSchema = new Schema(
  {
    subtotal: { type: Number, required: true },
    shipping: { type: Number, required: true },
    grandTotal: { type: Number, required: true },
  },
  { _id: false },
);

const reservationSchema = new Schema(
  {
    status: { type: String, enum: ['held', 'allocated', 'shipped', 'released'], required: true },
    expiresAt: { type: Date, required: true },
    releasedAt: { type: Date },
    allocatedAt: { type: Date },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true },
    items: { type: [orderItemSchema], required: true },
    address: { type: addressSchema, required: true },
    shipping: { type: shippingSnapshotSchema, required: true },
    totals: { type: totalsSchema, required: true },
    quoteHash: { type: String, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },
    shippingStatus: { type: String, enum: SHIPPING_STATUSES, default: 'pending', index: true },
    shippingHold: {
      active: { type: Boolean, default: false },
      reason: { type: String, maxlength: 500 },
      caseId: { type: Schema.Types.ObjectId, ref: 'PaymentCase' },
    },
    reservation: { type: reservationSchema, required: true },
    statusHistory: [
      {
        at: { type: Date, default: Date.now },
        type: { type: String, enum: ['payment', 'shipping', 'hold', 'note'], required: true },
        from: { type: String },
        to: { type: String },
        actor: { type: String, default: 'system' },
        note: { type: String, maxlength: 500 },
      },
    ],
    tracking: {
      courier: { type: String, maxlength: 80 },
      trackingNumber: { type: String, maxlength: 120 },
      shippedAt: Date,
      deliveredAt: Date,
    },
    paidAt: Date,
  },
  { timestamps: true },
);
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
export type OrderDoc = InferSchemaType<typeof orderSchema>;
export const Order: Model<OrderDoc> = models.Order ?? model('Order', orderSchema);

const checkoutKeySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true, maxlength: 200 },
    requestHash: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  },
  { timestamps: true },
);
checkoutKeySchema.index({ userId: 1, key: 1 }, { unique: true });
export const CheckoutKey: Model<InferSchemaType<typeof checkoutKeySchema>> =
  models.CheckoutKey ?? model('CheckoutKey', checkoutKeySchema);

export const ATTEMPT_STATUSES = [
  'created',
  'pending',
  'paid',
  'failed',
  'expired',
  'cancelled',
  'uncertain',
  'review',
  'partially_refunded',
  'refunded',
  'disputed',
] as const;

const paymentAttemptSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    gatewayOrderId: { type: String, required: true },
    provider: { type: String, enum: ['simulation', 'midtrans'], required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ATTEMPT_STATUSES, default: 'created', index: true },
    open: { type: Boolean, default: true },
    redirectUrl: { type: String },
    snapToken: { type: String },
    sessionExpiresAt: { type: Date, required: true },
    methodWindowEndsAt: { type: Date, required: true },
    lastCheckedAt: { type: Date },
    verifiedAt: { type: Date },
    gatewayTransactionId: { type: String },
    gatewayStatus: { type: String },
    fraudStatus: { type: String },
    paymentType: { type: String },
    failureReason: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);
paymentAttemptSchema.index({ gatewayOrderId: 1 }, { unique: true });
paymentAttemptSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { open: true }, name: 'one_open_attempt_per_order' },
);
paymentAttemptSchema.index({ status: 1, createdAt: 1 });
export type PaymentAttemptDoc = InferSchemaType<typeof paymentAttemptSchema>;
export const PaymentAttempt: Model<PaymentAttemptDoc> =
  models.PaymentAttempt ?? model('PaymentAttempt', paymentAttemptSchema);

const webhookEventSchema = new Schema(
  {
    eventKey: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    attemptId: { type: Schema.Types.ObjectId, ref: 'PaymentAttempt' },
    gatewayOrderId: { type: String, required: true },
    source: { type: String, enum: ['webhook', 'job', 'admin', 'simulation'], required: true },
    status: {
      type: String,
      enum: ['pending', 'processed', 'failed', 'ignored'],
      default: 'pending',
      index: true,
    },
    signatureValid: { type: Boolean, default: false },
    result: { type: String, maxlength: 300 },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, maxlength: 300 },
    availableAt: { type: Date, default: Date.now },
    processedAt: Date,
  },
  { timestamps: true },
);
webhookEventSchema.index({ eventKey: 1 }, { unique: true });
webhookEventSchema.index({ status: 1, availableAt: 1 });
export const WebhookEvent: Model<InferSchemaType<typeof webhookEventSchema>> =
  models.WebhookEvent ?? model('WebhookEvent', webhookEventSchema);

const paymentCaseSchema = new Schema(
  {
    caseNumber: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    type: {
      type: String,
      enum: [
        'amount_mismatch',
        'late_payment',
        'gateway_conflict',
        'uncertain_payment',
        'refund',
        'chargeback',
        'stock_issue',
        'shipping_issue',
      ],
      required: true,
    },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open', index: true },
    priority: { type: String, enum: ['normal', 'high'], default: 'normal' },
    reason: { type: String, required: true, maxlength: 500 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    evidence: [{ label: String, reference: String }],
    history: [
      {
        at: { type: Date, default: Date.now },
        actorId: { type: Schema.Types.ObjectId, ref: 'User' },
        action: { type: String, required: true },
        note: { type: String, maxlength: 500 },
      },
    ],
  },
  { timestamps: true },
);
paymentCaseSchema.index({ caseNumber: 1 }, { unique: true });
paymentCaseSchema.index({ status: 1, createdAt: -1 });
export type PaymentCaseDoc = InferSchemaType<typeof paymentCaseSchema>;
export const PaymentCase: Model<PaymentCaseDoc> =
  models.PaymentCase ?? model('PaymentCase', paymentCaseSchema);

const auditLogSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User' },
  actorEmail: { type: String, maxlength: 200 },
  action: { type: String, required: true, maxlength: 80 },
  targetType: { type: String, required: true, maxlength: 40 },
  targetId: { type: String, maxlength: 120 },
  correlationId: { type: String, maxlength: 80 },
  summary: { type: String, required: true, maxlength: 500 },
  changes: { type: Schema.Types.Mixed },
  at: { type: Date, default: Date.now },
});
auditLogSchema.index({ at: -1 });
auditLogSchema.index({ actorId: 1, at: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });
export const AuditLog: Model<InferSchemaType<typeof auditLogSchema>> =
  models.AuditLog ?? model('AuditLog', auditLogSchema);

const analyticsEventSchema = new Schema({
  type: {
    type: String,
    enum: [
      'view_product',
      'select_variant',
      'add_to_cart',
      'checkout_started',
      'shipping_unavailable',
      'order_created',
      'payment_verified',
      'payment_review_required',
      'order_shipped',
    ],
    required: true,
    index: true,
  },
  dedupeKey: { type: String },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  pseudonym: { type: String, maxlength: 80 },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});
analyticsEventSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $exists: true } } },
);
analyticsEventSchema.index({ type: 1, createdAt: -1 });
export const AnalyticsEvent: Model<InferSchemaType<typeof analyticsEventSchema>> =
  models.AnalyticsEvent ?? model('AnalyticsEvent', analyticsEventSchema);

const simulatedTransactionSchema = new Schema(
  {
    gatewayOrderId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'settlement', 'capture', 'deny', 'expire', 'cancel', 'failure'],
      default: 'pending',
    },
    fraudStatus: { type: String, enum: ['accept', 'challenge', 'deny'] },
    transactionId: { type: String },
    paymentType: { type: String, default: 'qris' },
    settledAt: Date,
  },
  { timestamps: true },
);
export const SimulatedTransaction: Model<InferSchemaType<typeof simulatedTransactionSchema>> =
  models.SimulatedTransaction ?? model('SimulatedTransaction', simulatedTransactionSchema);

const rateLimitBucketSchema = new Schema({
  key: { type: String, required: true, unique: true },
  windowStart: { type: Date, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});
rateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RateLimitBucket: Model<InferSchemaType<typeof rateLimitBucketSchema>> =
  models.RateLimitBucket ?? model('RateLimitBucket', rateLimitBucketSchema);

export const models_ = {
  User,
  Session,
  PasswordResetToken,
  Product,
  Inventory,
  InventoryEntry,
  ShippingZone,
  Order,
  CheckoutKey,
  PaymentAttempt,
  WebhookEvent,
  PaymentCase,
  AuditLog,
  AnalyticsEvent,
  SimulatedTransaction,
  RateLimitBucket,
};
