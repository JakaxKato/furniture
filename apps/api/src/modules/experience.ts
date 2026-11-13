import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { enforceRateLimit } from '../lib/rateLimit';
import { asyncHandler } from '../middleware/async';
import { hasPermission, requireAuth, requirePermission } from '../middleware/auth';
import {
  AnalyticsEvent,
  InboxRead,
  Inventory,
  InventoryEntry,
  Order,
  PaymentCase,
  SupportTicket,
  User,
} from '../models';
import { writeAudit } from './audit';
import { orderDocument } from './orderDocument';

export const experienceRouter = Router();
experienceRouter.use(requireAuth);
experienceRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
experienceRouter.use((req, _res, next) => {
  if (req.method === 'GET') return next();
  void enforceRateLimit({
    prefix: 'experience',
    identifier: String(req.auth!.user._id),
    limit: 60,
    windowSeconds: 60,
  })
    .then(() => next())
    .catch(next);
});
const wrap = asyncHandler;
const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) });
const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const httpsUrl = z
  .string()
  .url()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Tautan harus HTTPS tanpa kredensial.');
const messageSchema = z.object({
  body: z.string().trim().min(5).max(2000),
  evidenceUrl: httpsUrl.optional(),
});
const activeStatuses = ['open', 'in_progress', 'waiting_customer', 'approved'];
const audit = (
  req: Request,
  action: string,
  targetType: string,
  targetId: string,
  summary: string,
  session?: import('mongoose').ClientSession,
) =>
  writeAudit({
    actorId: String(req.auth!.user._id),
    actorEmail: req.auth!.user.email,
    correlationId: req.requestId,
    action,
    targetType,
    targetId,
    summary,
    session,
  });
const paginate = (page: number, total: number, items: unknown[]) => ({
  items,
  page,
  total,
  totalPages: Math.max(1, Math.ceil(total / 20)),
});

experienceRouter.get(
  '/tickets',
  wrap(async (req, res) => {
    const { page } = pageSchema.parse(req.query);
    const filter = { userId: req.auth!.user._id };
    const [items, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * 20)
        .limit(20),
      SupportTicket.countDocuments(filter),
    ]);
    res.json(paginate(page, total, items));
  }),
);
experienceRouter.post(
  '/tickets',
  wrap(async (req, res) => {
    const body = messageSchema
      .extend({
        orderNumber: z.string().min(5).max(60),
        kind: z.enum(['help', 'shipping', 'return', 'refund']),
        subject: z.string().trim().min(5).max(160),
      })
      .strict()
      .parse(req.body);
    const order = await Order.findOne({ orderNumber: body.orderNumber, userId: req.auth!.user._id });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Pesanan tidak ditemukan.');
    if (['return', 'refund'].includes(body.kind) && !order.paidAt)
      throw new AppError(409, 'NOT_PAID', 'Pengajuan ini memerlukan pembayaran yang telah diterima.');
    const ticket = await SupportTicket.create({
      number: `TKT-${randomUUID().slice(0, 8).toUpperCase()}`,
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      kind: body.kind,
      subject: body.subject,
      dueAt: new Date(Date.now() + 48 * 3600_000),
      messages: [
        { author: 'customer', name: req.auth!.user.name, body: body.body, evidenceUrl: body.evidenceUrl },
      ],
    });
    res.status(201).json({ ticket });
  }),
);
experienceRouter.post(
  '/tickets/:id/replies',
  wrap(async (req, res) => {
    const body = messageSchema
      .extend({ revision: z.number().int().min(0) })
      .strict()
      .parse(req.body);
    const ticket = await SupportTicket.findOneAndUpdate(
      {
        _id: idSchema.parse(req.params.id),
        userId: req.auth!.user._id,
        revision: body.revision,
        status: { $in: activeStatuses },
      },
      {
        $push: {
          messages: {
            author: 'customer',
            name: req.auth!.user.name,
            body: body.body,
            evidenceUrl: body.evidenceUrl,
          },
        },
        $set: { status: 'open', dueAt: new Date(Date.now() + 48 * 3600_000) },
        $inc: { revision: 1 },
      },
      { new: true },
    );
    if (!ticket) throw new AppError(409, 'TICKET_CHANGED', 'Tiket telah berubah atau ditutup. Muat ulang.');
    res.json({ ticket });
  }),
);
experienceRouter.get(
  '/admin/tickets',
  requirePermission('support:manage'),
  wrap(async (req, res) => {
    const { page, status } = pageSchema
      .extend({
        status: z
          .enum(['open', 'in_progress', 'waiting_customer', 'approved', 'resolved', 'rejected'])
          .optional(),
      })
      .parse(req.query);
    const filter = status ? { status } : {};
    const [items, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ dueAt: 1 })
        .skip((page - 1) * 20)
        .limit(20),
      SupportTicket.countDocuments(filter),
    ]);
    res.json(paginate(page, total, items));
  }),
);
experienceRouter.patch(
  '/admin/tickets/:id',
  requirePermission('support:manage'),
  wrap(async (req, res) => {
    const body = messageSchema
      .extend({
        revision: z.number().int().min(0),
        status: z.enum(['in_progress', 'waiting_customer', 'approved', 'resolved', 'rejected']),
        priority: z.enum(['normal', 'high']),
        dueAt: z.string().datetime(),
      })
      .strict()
      .parse(req.body);
    const session = await SupportTicket.startSession();
    try {
      await session.withTransaction(async () => {
        const ticket = await SupportTicket.findById(idSchema.parse(req.params.id)).session(session);
        if (!ticket) throw new AppError(404, 'NOT_FOUND', 'Tiket tidak ditemukan.');
        if (!activeStatuses.includes(ticket.status) || ticket.revision !== body.revision)
          throw new AppError(409, 'TICKET_CHANGED', 'Tiket sudah berubah atau ditutup. Muat ulang.');
        if (
          ticket.kind === 'refund' &&
          ['approved', 'resolved', 'rejected'].includes(body.status) &&
          !hasPermission(req.auth!.user.role, 'cases:manage')
        )
          throw new AppError(403, 'FORBIDDEN', 'Keputusan refund memerlukan admin keuangan.');
        if (ticket.kind === 'refund' && body.status === 'resolved') {
          const order = await Order.findById(ticket.orderId).session(session);
          if (!order || !['refunded', 'partially_refunded'].includes(order.paymentStatus))
            throw new AppError(
              409,
              'REFUND_UNVERIFIED',
              'Selesaikan setelah refund terkonfirmasi oleh gateway.',
            );
        }
        const result = await SupportTicket.updateOne(
          { _id: ticket._id, revision: body.revision },
          {
            $set: {
              status: body.status,
              priority: body.priority,
              dueAt: new Date(body.dueAt),
              ownerId: req.auth!.user._id,
              ownerName: req.auth!.user.name,
            },
            $push: {
              messages: {
                author: 'staff',
                name: req.auth!.user.name,
                body: body.body,
                evidenceUrl: body.evidenceUrl,
              },
            },
            $inc: { revision: 1 },
          },
          { session },
        );
        if (!result.modifiedCount) throw new AppError(409, 'TICKET_CHANGED', 'Tiket berubah. Muat ulang.');
        await audit(
          req,
          'support.update',
          'ticket',
          ticket.number,
          `Status ${ticket.status} → ${body.status}; prioritas ${body.priority}.`,
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    res.json({ ok: true });
  }),
);

// Inbox is projected from durable order/ticket history, so refreshes cannot duplicate notifications.
experienceRouter.get(
  '/inbox',
  wrap(async (req, res) => {
    const userId = req.auth!.user._id;
    const [orderEvents, replies, read] = await Promise.all([
      Order.aggregate([
        { $match: { userId } },
        { $unwind: '$statusHistory' },
        { $sort: { 'statusHistory.at': -1 } },
        { $limit: 50 },
        { $project: { orderNumber: 1, statusHistory: 1 } },
      ]),
      SupportTicket.aggregate([
        { $match: { userId } },
        { $unwind: '$messages' },
        { $match: { 'messages.author': 'staff' } },
        { $sort: { 'messages.at': -1 } },
        { $limit: 50 },
        { $project: { number: 1, orderNumber: 1, messages: 1 } },
      ]),
      InboxRead.findOne({ userId }),
    ]);
    const labels: Record<string, string> = {
      paid: 'Pembayaran diterima',
      ready: 'Pesanan siap kirim',
      shipped: 'Pesanan dikirim',
      delivered: 'Pesanan diterima',
      verifying: 'Pembayaran sedang diperiksa',
      review: 'Pembayaran sedang ditinjau',
      refunded: 'Refund tercatat',
      partially_refunded: 'Refund sebagian tercatat',
      expired: 'Pembayaran kedaluwarsa',
    };
    const items = [
      ...orderEvents.map((row) => ({
        id: `order-${row.statusHistory._id}`,
        at: row.statusHistory.at,
        title: `${row.orderNumber}: ${labels[row.statusHistory.to] ?? 'Pembaruan pesanan'}`,
        body: row.statusHistory.note ?? '',
        href: `/akun/pesanan/${row.orderNumber}`,
      })),
      ...replies.map((row) => ({
        id: `ticket-${row.messages._id}`,
        at: row.messages.at,
        title: `Balasan ${row.number}`,
        body: row.messages.body,
        href: '/akun/bantuan',
      })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 50)
      .map((item) => ({ ...item, unread: !read || new Date(item.at) > read.readThrough }));
    res.json({
      items,
      unread: items.filter((item) => item.unread).length,
      readThrough: items[0]?.at ?? read?.readThrough ?? new Date(0),
    });
  }),
);
experienceRouter.post(
  '/inbox/read',
  wrap(async (req, res) => {
    const { through } = z.object({ through: z.string().datetime() }).strict().parse(req.body);
    const at = new Date(Math.min(new Date(through).getTime(), Date.now()));
    await InboxRead.updateOne(
      { userId: req.auth!.user._id },
      { $max: { readThrough: at } },
      { upsert: true },
    );
    res.json({ ok: true });
  }),
);

export function reportRange(from?: string, to?: string) {
  const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const start = new Date(`${day.parse(from ?? today)}T00:00:00+07:00`);
  const end = new Date(new Date(`${day.parse(to ?? today)}T00:00:00+07:00`).getTime() + 86400_000);
  if (end <= start || end.getTime() - start.getTime() > 366 * 86400_000)
    throw new AppError(400, 'DATE_RANGE', 'Pilih rentang tanggal maksimal 366 hari.');
  return { start, end };
}
experienceRouter.get(
  '/admin/report',
  requirePermission('orders:read'),
  wrap(async (req, res) => {
    const query = z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .strict()
      .parse(req.query);
    const { start, end } = reportRange(query.from, query.to);
    const paidFilter = { paymentStatus: 'paid', paidAt: { $gte: start, $lt: end } };
    const [paid, placed, top, events, failures] = await Promise.all([
      Order.aggregate([
        { $match: paidFilter },
        { $group: { _id: null, revenue: { $sum: '$totals.grandTotal' }, count: { $sum: 1 } } },
      ]),
      Order.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      Order.aggregate([
        { $match: paidFilter },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.sku',
            name: { $first: '$items.productName' },
            quantity: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.lineTotal' },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 10 },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { type: 'shipping_unavailable', createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: '$metadata.reason', count: { $sum: 1 } } },
      ]),
    ]);
    const revenue = paid[0]?.revenue ?? 0,
      paidOrders = paid[0]?.count ?? 0;
    res.json({
      start,
      end,
      placed,
      paidOrders,
      revenue,
      average: paidOrders ? revenue / paidOrders : 0,
      top,
      events,
      failures,
    });
  }),
);
experienceRouter.get(
  '/admin/queue',
  requirePermission('orders:read'),
  wrap(async (_req, res) => {
    const [orders, tickets, cases] = await Promise.all([
      Order.find({
        $or: [
          { paymentStatus: { $in: ['verifying', 'review'] } },
          { paymentStatus: 'paid', shippingStatus: { $ne: 'delivered' } },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(100),
      SupportTicket.find({ status: { $in: activeStatuses } })
        .sort({ dueAt: 1 })
        .limit(50),
      PaymentCase.find({ status: { $ne: 'resolved' } })
        .sort({ createdAt: 1 })
        .limit(50),
    ]);
    const rows = orders.map((order) => {
      const due =
        order.operations?.shipBy ?? new Date((order.paidAt ?? order.createdAt).getTime() + 48 * 3600_000);
      return {
        id: String(order._id),
        title: order.orderNumber,
        task: order.shippingHold?.active
          ? 'Selesaikan penahanan'
          : ['review', 'verifying'].includes(order.paymentStatus)
            ? 'Periksa pembayaran'
            : order.shippingStatus === 'shipped'
              ? 'Pantau pengiriman'
              : order.shippingStatus === 'ready'
                ? 'Serahkan ke kurir'
                : 'Ambil dan kemas barang',
        owner: order.operations?.ownerName ?? null,
        dueAt: order.shippingStatus === 'shipped' ? (order.operations?.expectedDelivery ?? null) : due,
        href: `/admin/pesanan/${order.orderNumber}`,
      };
    });
    rows.push(
      ...tickets.map((t) => ({
        id: String(t._id),
        title: t.number,
        task: t.subject,
        owner: t.ownerName ?? null,
        dueAt: t.dueAt,
        href: '/admin/layanan',
      })),
    );
    res.json({
      items: rows.sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity)),
      openPaymentCases: cases.length,
      unassignedCases: cases.filter((c) => !c.ownerId).length,
    });
  }),
);
experienceRouter.get(
  '/admin/orders/:number/operations',
  requirePermission('orders:read'),
  wrap(async (req, res) => {
    const order = await Order.findOne({ orderNumber: req.params.number });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.');
    const staff = await User.find({ role: { $in: ['admin_ops', 'super_admin'] }, status: 'active' }).select(
      'name',
    );
    res.json({
      operations: order.operations ?? { revision: 0 },
      staff: staff.map((u) => ({ id: String(u._id), name: u.name })),
    });
  }),
);
experienceRouter.patch(
  '/admin/orders/:number/operations',
  requirePermission('orders:fulfill'),
  wrap(async (req, res) => {
    const body = z
      .object({
        revision: z.number().int().min(0),
        ownerId: idSchema.nullable(),
        shipBy: z.string().datetime().nullable(),
        expectedDelivery: z.string().datetime().nullable(),
        customerUpdate: z.string().trim().max(500),
        trackingUrl: httpsUrl.or(z.literal('')),
        picked: z.boolean(),
        packed: z.boolean(),
        inspected: z.boolean(),
      })
      .strict()
      .parse(req.body);
    if ((body.packed && !body.picked) || (body.inspected && !body.packed))
      throw new AppError(400, 'CHECKLIST_ORDER', 'Selesaikan ambil barang, kemas, lalu pemeriksaan.');
    const owner = body.ownerId
      ? await User.findOne({
          _id: body.ownerId,
          role: { $in: ['admin_ops', 'super_admin'] },
          status: 'active',
        })
      : null;
    if (body.ownerId && !owner)
      throw new AppError(400, 'OWNER_INVALID', 'Penanggung jawab operasional tidak valid.');
    const session = await Order.startSession();
    try {
      await session.withTransaction(async () => {
        const order = await Order.findOne({ orderNumber: req.params.number }).session(session);
        if (!order) throw new AppError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.');
        if ((order.operations?.revision ?? 0) !== body.revision)
          throw new AppError(409, 'ORDER_CHANGED', 'Pesanan berubah. Muat ulang.');
        const changedMessage =
          body.customerUpdate && body.customerUpdate !== order.operations?.customerUpdate;
        order.set('operations', {
          ...body,
          ownerId: owner?._id ?? null,
          ownerName: owner?.name ?? null,
          shipBy: body.shipBy ? new Date(body.shipBy) : null,
          expectedDelivery: body.expectedDelivery ? new Date(body.expectedDelivery) : null,
          revision: body.revision + 1,
        });
        if (changedMessage)
          order.statusHistory.push({
            at: new Date(),
            type: 'note',
            actor: String(req.auth!.user._id),
            note: body.customerUpdate,
          });
        await order.save({ session });
        await audit(
          req,
          'order.operations',
          'order',
          order.orderNumber,
          'Memperbarui penanggung jawab, target, dan pemeriksaan pesanan.',
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    res.json({ ok: true });
  }),
);
experienceRouter.get(
  '/admin/restock',
  requirePermission('inventory:manage'),
  wrap(async (req, res) => {
    const { page } = pageSchema.parse(req.query);
    const [items, total] = await Promise.all([
      Inventory.find()
        .sort({ sku: 1 })
        .skip((page - 1) * 20)
        .limit(20),
      Inventory.countDocuments(),
    ]);
    res.json(
      paginate(
        page,
        total,
        items.map((i) => {
          const available = i.physical - i.held - i.allocated;
          return {
            sku: i.sku,
            revision: i.planningRevision ?? 0,
            physical: i.physical,
            available,
            reorderPoint: i.reorderPoint ?? 2,
            targetStock: i.targetStock ?? 10,
            incoming: i.incoming ?? 0,
            expectedAt: i.expectedAt ?? null,
            suggested: Math.max(0, (i.targetStock ?? 10) - available - (i.incoming ?? 0)),
            low: available <= (i.reorderPoint ?? 2),
          };
        }),
      ),
    );
  }),
);
experienceRouter.patch(
  '/admin/restock/:sku',
  requirePermission('inventory:manage'),
  wrap(async (req, res) => {
    const body = z
      .object({
        revision: z.number().int().min(0),
        reorderPoint: z.number().int().min(0).max(100000),
        targetStock: z.number().int().min(0).max(100000),
        incoming: z.number().int().min(0).max(100000),
        expectedAt: z.string().datetime().nullable(),
      })
      .strict()
      .refine((v) => v.targetStock >= v.reorderPoint, 'Target stok minimal sama dengan batas minimum.')
      .parse(req.body);
    const session = await Inventory.startSession();
    try {
      await session.withTransaction(async () => {
        const { revision, ...plan } = body;
        const inventory = await Inventory.findOneAndUpdate(
          { sku: req.params.sku, $expr: { $eq: [{ $ifNull: ['$planningRevision', 0] }, revision] } },
          { $set: plan, $inc: { planningRevision: 1 } },
          { new: true, session },
        );
        if (!inventory)
          throw new AppError(409, 'INVENTORY_CHANGED', 'Rencana stok berubah. Muat ulang sebelum menyimpan.');
        await audit(
          req,
          'inventory.plan',
          'inventory',
          inventory.sku,
          'Memperbarui rencana stok dan barang masuk.',
          session,
        );
      });
    } finally {
      await session.endSession();
    }
    res.json({ ok: true });
  }),
);
experienceRouter.post(
  '/admin/restock/:sku/receive',
  requirePermission('inventory:manage'),
  wrap(async (req, res) => {
    const body = z
      .object({
        quantity: z.number().int().min(1).max(100000),
        reason: z.string().trim().min(5).max(500),
        key: z.string().uuid(),
      })
      .strict()
      .parse(req.body);
    const receiveKey = `${req.auth!.user._id}:${req.params.sku}:${body.key}`;
    const checkReceipt = async () => {
      const entry = await InventoryEntry.findOne({ receiveKey });
      if (entry && (entry.quantity !== body.quantity || entry.reason !== body.reason))
        throw new AppError(
          409,
          'RECEIPT_CONFLICT',
          'Referensi penerimaan sudah digunakan untuk isi berbeda.',
        );
      return Boolean(entry);
    };
    if (await checkReceipt()) {
      res.json({ ok: true });
      return;
    }
    const session = await Inventory.startSession();
    try {
      await session.withTransaction(async () => {
        const inventory = await Inventory.findOneAndUpdate(
          { sku: req.params.sku, incoming: { $gte: body.quantity } },
          { $inc: { physical: body.quantity, incoming: -body.quantity, planningRevision: 1 } },
          { new: true, session },
        );
        if (!inventory)
          throw new AppError(
            409,
            'INCOMING_CHANGED',
            'Jumlah melebihi barang masuk yang direncanakan. Muat ulang.',
          );
        await InventoryEntry.create(
          [
            {
              receiveKey,
              sku: inventory.sku,
              productId: inventory.productId,
              type: 'adjust',
              quantity: body.quantity,
              physicalDelta: body.quantity,
              actorId: req.auth!.user._id,
              reason: body.reason,
              correlationId: req.requestId,
            },
          ],
          { session },
        );
        await audit(
          req,
          'inventory.receive',
          'inventory',
          inventory.sku,
          `Menerima ${body.quantity} unit. ${body.reason}`,
          session,
        );
      });
    } catch (error) {
      if (!(await checkReceipt())) throw error;
    } finally {
      await session.endSession();
    }
    res.json({ ok: true });
  }),
);
experienceRouter.get(
  '/orders/:number/document',
  wrap(async (req, res) => {
    const order = await Order.findOne({ orderNumber: req.params.number, userId: req.auth!.user._id });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.');
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(orderDocument(order, false));
  }),
);
experienceRouter.get(
  '/admin/orders/:number/document',
  requirePermission('orders:read'),
  wrap(async (req, res) => {
    const order = await Order.findOne({ orderNumber: req.params.number });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Pesanan tidak ditemukan.');
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(orderDocument(order, true));
  }),
);
