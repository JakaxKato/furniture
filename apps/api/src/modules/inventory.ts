import type { ClientSession, Types } from 'mongoose';
import { AppError } from '../lib/errors';
import { Inventory, InventoryEntry, Order, type InventoryDoc } from '../models';

export function availableOf(inventory: Pick<InventoryDoc, 'physical' | 'held' | 'allocated'>): number {
  return Math.max(0, inventory.physical - inventory.held - inventory.allocated);
}

type ReservationItem = {
  sku: string;
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  quantity: number;
};

async function entry(
  input: {
    sku: string;
    productId?: Types.ObjectId;
    orderId?: Types.ObjectId;
    type: 'reserve' | 'release' | 'allocate' | 'ship' | 'adjust';
    quantity: number;
    physicalDelta?: number;
    heldDelta?: number;
    allocatedDelta?: number;
    reason?: string;
    actorId?: string;
    correlationId?: string;
  },
  session: ClientSession,
): Promise<void> {
  await InventoryEntry.create(
    [
      {
        sku: input.sku,
        productId: input.productId,
        orderId: input.orderId,
        type: input.type,
        quantity: input.quantity,
        physicalDelta: input.physicalDelta ?? 0,
        heldDelta: input.heldDelta ?? 0,
        allocatedDelta: input.allocatedDelta ?? 0,
        reason: input.reason,
        actorId: input.actorId,
        correlationId: input.correlationId,
      },
    ],
    { session },
  );
}

export async function reserveStock(
  items: ReservationItem[],
  orderId: Types.ObjectId,
  correlationId: string,
  session: ClientSession,
): Promise<void> {
  for (const item of items) {
    const result = await Inventory.updateOne(
      {
        sku: item.sku,
        $expr: {
          $gte: [{ $subtract: ['$physical', { $add: ['$held', '$allocated'] }] }, item.quantity],
        },
      },
      { $inc: { held: item.quantity } },
      { session },
    );
    if (result.modifiedCount !== 1) {
      throw new AppError(409, 'OUT_OF_STOCK', 'Stok untuk salah satu varian tidak mencukupi.', {
        sku: item.sku,
        available: await currentAvailable(item.sku, session),
      });
    }
    await entry(
      {
        sku: item.sku,
        productId: item.productId,
        orderId,
        type: 'reserve',
        quantity: item.quantity,
        heldDelta: item.quantity,
        reason: 'Checkout membuat reservasi stok.',
        correlationId,
      },
      session,
    );
  }
}

export async function allocateReservation(
  orderId: Types.ObjectId,
  correlationId: string,
  session: ClientSession,
): Promise<boolean> {
  const now = new Date();
  const order = await Order.findOneAndUpdate(
    { _id: orderId, 'reservation.status': 'held' },
    {
      $set: { 'reservation.status': 'allocated', 'reservation.allocatedAt': now },
      $push: {
        statusHistory: {
          at: now,
          type: 'payment',
          from: 'held',
          to: 'allocated',
          actor: 'system',
          note: 'Pembayaran terverifikasi; stok dialokasikan.',
        },
      },
    },
    { new: true, session },
  );
  if (!order) return false;
  for (const item of order.items) {
    const result = await Inventory.updateOne(
      { sku: item.sku, held: { $gte: item.quantity } },
      { $inc: { held: -item.quantity, allocated: item.quantity } },
      { session },
    );
    if (result.modifiedCount !== 1) {
      throw new AppError(500, 'STOCK_STATE_INVALID', 'Alokasi stok tidak konsisten.');
    }
    await entry(
      {
        sku: item.sku,
        productId: item.productId,
        orderId,
        type: 'allocate',
        quantity: item.quantity,
        heldDelta: -item.quantity,
        allocatedDelta: item.quantity,
        reason: 'Pembayaran terverifikasi.',
        correlationId,
      },
      session,
    );
  }
  return true;
}

export async function releaseReservation(
  orderId: Types.ObjectId,
  reason: string,
  correlationId: string,
  session: ClientSession,
): Promise<boolean> {
  const now = new Date();
  const order = await Order.findOneAndUpdate(
    { _id: orderId, 'reservation.status': 'held' },
    {
      $set: { 'reservation.status': 'released', 'reservation.releasedAt': now },
      $push: {
        statusHistory: {
          at: now,
          type: 'payment',
          from: 'held',
          to: 'released',
          actor: 'system',
          note: reason,
        },
      },
    },
    { new: true, session },
  );
  if (!order) return false;
  for (const item of order.items) {
    const result = await Inventory.updateOne(
      { sku: item.sku, held: { $gte: item.quantity } },
      { $inc: { held: -item.quantity } },
      { session },
    );
    if (result.modifiedCount !== 1) {
      throw new AppError(500, 'STOCK_STATE_INVALID', 'Pelepasan reservasi tidak konsisten.');
    }
    await entry(
      {
        sku: item.sku,
        productId: item.productId,
        orderId,
        type: 'release',
        quantity: item.quantity,
        heldDelta: -item.quantity,
        reason,
        correlationId,
      },
      session,
    );
  }
  return true;
}

export async function shipAllocation(
  orderId: Types.ObjectId,
  correlationId: string,
  actorId: string,
  session: ClientSession,
): Promise<void> {
  const order = await Order.findOne({ _id: orderId }, null, { session });
  if (!order || order.reservation.status !== 'allocated') {
    throw new AppError(409, 'NOT_ALLOCATED', 'Pesanan belum memiliki alokasi stok.');
  }
  const now = new Date();
  for (const item of order.items) {
    const result = await Inventory.updateOne(
      {
        sku: item.sku,
        allocated: { $gte: item.quantity },
        physical: { $gte: item.quantity },
      },
      { $inc: { physical: -item.quantity, allocated: -item.quantity } },
      { session },
    );
    if (result.modifiedCount !== 1) {
      throw new AppError(409, 'STOCK_STATE_INVALID', 'Stok fisik atau alokasi tidak mencukupi.');
    }
    await entry(
      {
        sku: item.sku,
        productId: item.productId,
        orderId,
        type: 'ship',
        quantity: item.quantity,
        physicalDelta: -item.quantity,
        allocatedDelta: -item.quantity,
        reason: 'Pesanan dikirim.',
        actorId,
        correlationId,
      },
      session,
    );
  }
  await Order.updateOne(
    { _id: orderId, 'reservation.status': 'allocated' },
    {
      $set: { 'reservation.status': 'shipped' },
      $push: {
        statusHistory: {
          at: now,
          type: 'shipping',
          from: 'allocated',
          to: 'shipped',
          actor: actorId,
          note: 'Stok fisik dikurangi bersamaan dengan alokasi.',
        },
      },
    },
    { session },
  );
}

export async function adjustPhysical(
  sku: string,
  newPhysical: number,
  reason: string,
  actorId: string,
  correlationId: string,
): Promise<{ before: number; after: number }> {
  const beforeDoc = await Inventory.findOne({ sku });
  if (!beforeDoc) throw new AppError(404, 'SKU_NOT_FOUND', 'SKU tidak ditemukan.');
  if (!Number.isSafeInteger(newPhysical) || newPhysical < 0) {
    throw new AppError(400, 'INVALID_STOCK', 'Stok fisik harus bilangan bulat yang tidak negatif.');
  }
  const minimum = beforeDoc.held + beforeDoc.allocated;
  if (newPhysical < minimum) {
    throw new AppError(
      409,
      'STOCK_BELOW_COMMITMENTS',
      'Stok fisik tidak boleh lebih kecil dari stok ditahan dan dialokasikan.',
      { minimum },
    );
  }
  const session = await Inventory.startSession();
  try {
    await session.withTransaction(async () => {
      const result = await Inventory.updateOne(
        {
          sku,
          held: beforeDoc.held,
          allocated: beforeDoc.allocated,
          $expr: { $lte: [{ $add: ['$held', '$allocated'] }, newPhysical] },
        },
        { $set: { physical: newPhysical } },
        { session },
      );
      if (result.modifiedCount !== 1) {
        throw new AppError(409, 'STOCK_CONFLICT', 'Stok berubah. Muat ulang lalu coba lagi.');
      }
      await entry(
        {
          sku,
          productId: beforeDoc.productId,
          type: 'adjust',
          quantity: Math.abs(newPhysical - beforeDoc.physical),
          physicalDelta: newPhysical - beforeDoc.physical,
          reason,
          actorId,
          correlationId,
        },
        session,
      );
    });
  } finally {
    await session.endSession();
  }
  return { before: beforeDoc.physical, after: newPhysical };
}

async function currentAvailable(sku: string, session: ClientSession): Promise<number | null> {
  const doc = await Inventory.findOne({ sku }, null, { session });
  if (!doc) return null;
  return availableOf(doc);
}
