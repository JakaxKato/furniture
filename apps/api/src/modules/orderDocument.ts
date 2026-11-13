import type { Order } from '../models';

const escape = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const money = (v: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
export function orderDocument(order: InstanceType<typeof Order>, warehouse: boolean): string {
  const title = warehouse ? 'Daftar ambil & kemas' : 'Ringkasan transaksi';
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} ${escape(order.orderNumber)}</title><style>
  body{font:16px/1.6 system-ui,sans-serif;color:#20251d;max-width:900px;margin:40px auto;padding:24px}table{width:100%;border-collapse:collapse}th,td{padding:12px;text-align:left;border-bottom:1px solid #ccc}small{color:#555}h1{font-size:28px}@media print{body{margin:0}.print-tip{display:none}}
  </style></head><body><h1>Ruang Teduh · ${title}</h1><p>${escape(order.orderNumber)} · ${escape(order.createdAt.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }))}</p>
  <p class="print-tip">Gunakan Cetak pada browser untuk mencetak atau menyimpan sebagai PDF.</p>
  <p>Status pembayaran: <strong>${escape(({ paid: 'Pembayaran diterima', refunded: 'Refund tercatat', partially_refunded: 'Refund sebagian tercatat', pending: 'Menunggu pembayaran' } as Record<string, string>)[order.paymentStatus] ?? 'Periksa status terbaru di akun')}</strong></p>
  <p>${escape(order.address.recipient)}<br>${escape(order.address.street)}<br>${escape(order.address.city)}, ${escape(order.address.province)} ${escape(order.address.postalCode)}<br>${escape(order.address.phone)}</p>
  <table><thead><tr><th>Produk / SKU</th><th>Jumlah</th><th>${warehouse ? 'Ambil / Kemas / Periksa' : 'Subtotal'}</th></tr></thead><tbody>${order.items.map((i) => `<tr><td>${escape(i.productName)} — ${escape(i.variantLabel)}<br><small>${escape(i.sku)}</small></td><td>${i.quantity}</td><td>${warehouse ? '□ / □ / □' : escape(money(i.lineTotal))}</td></tr>`).join('')}</tbody></table>
  ${warehouse ? '<p>Petugas: ____________________ &nbsp; Tanggal: ______________</p>' : `<p>Barang: ${money(order.totals.subtotal)}<br>Ongkir: ${money(order.totals.shipping)}<br><strong>Total: ${money(order.totals.grandTotal)}</strong></p><small>Ringkasan berdasarkan harga saat pesanan dibuat. Dokumen ini bukan faktur pajak. Status refund mengacu pada pembaruan pembayaran di akun.</small>`}</body></html>`;
}
