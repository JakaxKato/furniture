export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

function readCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const csrf = readCookie('teduh_csrf');
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string; details?: unknown }; requestId?: string } | null)
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'Permintaan gagal. Coba lagi.',
      error?.details,
      (data as { requestId?: string } | null)?.requestId,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body, headers }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function track(
  type: 'view_product' | 'select_variant' | 'add_to_cart' | 'checkout_started',
  payload: { productId?: string; sku?: string; quantity?: number } = {},
): void {
  api
    .post('/analytics/events', { type, ...payload })
    .catch(() => undefined);
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return 'Koneksi bermasalah. Periksa jaringan lalu coba lagi.';
  return 'Terjadi kesalahan. Coba lagi.';
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function attributeLabel(key: string): string {
  const labels: Record<string, string> = {
    size: 'Ukuran',
    firmness: 'Tingkat kekerasan',
    thicknessCm: 'Ketebalan',
    fill: 'Isi',
    heightCm: 'Tinggi',
    material: 'Bahan',
    finish: 'Finishing',
    widthCm: 'Lebar',
    depthCm: 'Kedalaman',
  };
  return labels[key] ?? key;
}

export function attributeValue(key: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (key.endsWith('Cm')) return `${value} cm`;
  return String(value);
}

export function dimensionsOf(attributes: Record<string, string | number | null | undefined>): string | null {
  const width = attributes.widthCm;
  const depth = attributes.depthCm;
  const height = attributes.heightCm;
  if (typeof width === 'number' && typeof depth === 'number' && typeof height === 'number') {
    return `${width} × ${depth} × ${height} cm`;
  }
  return null;
}
