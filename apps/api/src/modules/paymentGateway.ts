import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { SimulatedTransaction } from '../models';
import { randomId } from '../lib/crypto';

export type GatewayTransactionStatus =
  | 'pending'
  | 'settlement'
  | 'capture'
  | 'deny'
  | 'cancel'
  | 'expire'
  | 'failure'
  | 'refund'
  | 'partial_refund'
  | 'chargeback'
  | 'unknown';

export type GatewayStatus = {
  gatewayOrderId: string;
  transactionId?: string;
  status: GatewayTransactionStatus;
  fraudStatus?: string;
  paymentType?: string;
  grossAmount: number;
  rawStatus: string;
  statusCode: string;
  transactionTime?: Date;
};

export type CreateTransactionInput = {
  gatewayOrderId: string;
  amount: number;
  orderNumber: string;
  customer: { name: string; email: string; phone?: string };
  items: Array<{ name: string; price: number; quantity: number }>;
  finishUrl: string;
};

export type CreateTransactionResult = {
  redirectUrl: string;
  token?: string;
};

export class GatewayTimeoutError extends Error {
  constructor(message = 'Gateway pembayaran time-out.') {
    super(message);
    this.name = 'GatewayTimeoutError';
  }
}

export class GatewayError extends Error {
  readonly httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = 'GatewayError';
    this.httpStatus = httpStatus;
  }
}

export interface PaymentGateway {
  provider: 'simulation' | 'midtrans';
  createTransaction(input: CreateTransactionInput): Promise<CreateTransactionResult>;
  getStatus(gatewayOrderId: string): Promise<GatewayStatus | null>;
  simulate?(
    gatewayOrderId: string,
    action: 'settlement' | 'deny' | 'expire' | 'cancel' | 'capture_challenge',
  ): Promise<GatewayStatus | null>;
}

function parseAmount(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new GatewayError('Nominal gateway tidak valid.');
  }
  return value;
}

function normaliseStatus(raw: string): GatewayTransactionStatus {
  if (
    [
      'pending',
      'settlement',
      'capture',
      'deny',
      'cancel',
      'expire',
      'failure',
      'refund',
      'partial_refund',
      'chargeback',
    ].includes(raw)
  ) {
    return raw as GatewayTransactionStatus;
  }
  return 'unknown';
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 12_000): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new GatewayTimeoutError();
    throw new GatewayError('Gateway pembayaran tidak dapat dihubungi.');
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

export class MidtransGateway implements PaymentGateway {
  readonly provider = 'midtrans' as const;
  private readonly serverKey: string;

  constructor(serverKey?: string) {
    if (!serverKey) throw new Error('MIDTRANS_SERVER_KEY belum diatur.');
    this.serverKey = serverKey;
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`;
  }

  async createTransaction(input: CreateTransactionInput): Promise<CreateTransactionResult> {
    const body = {
      transaction_details: { order_id: input.gatewayOrderId, gross_amount: input.amount },
      item_details: input.items.map((item, index) => ({
        id: `${input.gatewayOrderId}-${index + 1}`,
        price: item.price,
        quantity: item.quantity,
        name: item.name.slice(0, 50),
      })),
      customer_details: {
        first_name: input.customer.name.slice(0, 50),
        email: input.customer.email,
        phone: input.customer.phone,
      },
      expiry: { unit: 'minutes', duration: env.SNAP_EXPIRY_MINUTES },
      callbacks: { finish: input.finishUrl },
    };
    const { status, body: response } = await fetchJson(`${env.MIDTRANS_SNAP_API_BASE}/snap/v1/transactions`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (status >= 500) throw new GatewayError('Gateway pembayaran gagal memproses permintaan.', status);
    if (status < 200 || status >= 300) {
      throw new GatewayError('Permintaan transaksi ditolak gateway.', status);
    }
    const data = response as { redirect_url?: unknown; token?: unknown } | null;
    if (!data || typeof data.redirect_url !== 'string') {
      throw new GatewayError('Respons gateway tidak memuat tautan pembayaran.');
    }
    return {
      redirectUrl: data.redirect_url,
      token: typeof data.token === 'string' ? data.token : undefined,
    };
  }

  async getStatus(gatewayOrderId: string): Promise<GatewayStatus | null> {
    const { status, body } = await fetchJson(
      `${env.MIDTRANS_API_BASE}/v2/${encodeURIComponent(gatewayOrderId)}/status`,
      {
        method: 'GET',
        headers: { Authorization: this.authHeader(), Accept: 'application/json' },
      },
    );
    if (status === 404) return null;
    if (status >= 500) throw new GatewayError('Gateway pembayaran gagal diakses.', status);
    if (status < 200 || status >= 300) throw new GatewayError('Status transaksi ditolak gateway.', status);
    const data = body as Record<string, unknown> | null;
    if (!data) throw new GatewayError('Respons status gateway kosong.');
    const rawStatus = String(data.transaction_status ?? '');
    return {
      gatewayOrderId: String(data.order_id ?? gatewayOrderId),
      transactionId: data.transaction_id ? String(data.transaction_id) : undefined,
      status: normaliseStatus(rawStatus),
      fraudStatus: data.fraud_status ? String(data.fraud_status) : undefined,
      paymentType: data.payment_type ? String(data.payment_type) : undefined,
      grossAmount: parseAmount(data.gross_amount),
      rawStatus,
      statusCode: String(data.status_code ?? ''),
    };
  }
}

export class SimulationGateway implements PaymentGateway {
  readonly provider = 'simulation' as const;

  constructor() {
    if (env.NODE_ENV === 'production') {
      throw new AppError(500, 'SIMULATION_FORBIDDEN', 'Adapter simulasi ditolak di produksi.');
    }
  }

  async createTransaction(input: CreateTransactionInput): Promise<CreateTransactionResult> {
    await SimulatedTransaction.findOneAndUpdate(
      { gatewayOrderId: input.gatewayOrderId },
      {
        $setOnInsert: {
          gatewayOrderId: input.gatewayOrderId,
          amount: input.amount,
          status: 'pending',
          paymentType: 'qris',
          transactionId: `SIM-${randomId(6).toUpperCase()}`,
        },
      },
      { upsert: true, new: true },
    );
    const redirectUrl = `${env.APP_ORIGIN}/pembayaran-simulasi/${encodeURIComponent(input.gatewayOrderId)}`;
    return { redirectUrl, token: `sim_${randomId(8)}` };
  }

  async getStatus(gatewayOrderId: string): Promise<GatewayStatus | null> {
    const doc = await SimulatedTransaction.findOne({ gatewayOrderId });
    if (!doc) return null;
    const statusCode =
      doc.status === 'settlement' || doc.status === 'capture' ? '200' : doc.status === 'pending' ? '201' : '202';
    return {
      gatewayOrderId: doc.gatewayOrderId,
      transactionId: doc.transactionId ?? undefined,
      status: normaliseStatus(doc.status),
      fraudStatus: doc.fraudStatus ?? undefined,
      paymentType: doc.paymentType ?? undefined,
      grossAmount: doc.amount,
      rawStatus: doc.status,
      statusCode,
      transactionTime: doc.updatedAt,
    };
  }

  async simulate(
    gatewayOrderId: string,
    action: 'settlement' | 'deny' | 'expire' | 'cancel' | 'capture_challenge',
  ): Promise<GatewayStatus | null> {
    if (env.NODE_ENV === 'production') return null;
    const update: Record<string, unknown> = {};
    if (action === 'settlement') {
      update.status = 'settlement';
      update.settledAt = new Date();
    } else if (action === 'deny') {
      update.status = 'deny';
    } else if (action === 'expire') {
      update.status = 'expire';
    } else if (action === 'cancel') {
      update.status = 'cancel';
    } else {
      update.status = 'capture';
      update.fraudStatus = 'challenge';
      update.paymentType = 'credit_card';
    }
    const doc = await SimulatedTransaction.findOneAndUpdate(
      { gatewayOrderId },
      { $set: update },
      { new: true },
    );
    if (!doc) return null;
    return this.getStatus(gatewayOrderId);
  }
}

export function createGateway(): PaymentGateway {
  if (env.PAYMENT_ADAPTER === 'midtrans') return new MidtransGateway(env.MIDTRANS_SERVER_KEY);
  return new SimulationGateway();
}

let activeGateway: PaymentGateway | null = null;

export function setGateway(gateway: PaymentGateway): void {
  activeGateway = gateway;
}

export function paymentGateway(): PaymentGateway {
  if (!activeGateway) activeGateway = createGateway();
  return activeGateway;
}
