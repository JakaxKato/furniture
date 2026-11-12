import { useRef, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useStore, useToast } from '../context/StoreContext';
import { ApiError, api, apiErrorMessage, formatRupiah, track } from '../lib/api';
import type { Address, OrderDetail, PaymentInfo, Quote } from '../lib/types';

type AddressForm = {
  recipient: string;
  phone: string;
  street: string;
  district: string;
  city: string;
  province: string;
  postalCode: string;
  notes: string;
};

const emptyAddress: AddressForm = {
  recipient: '',
  phone: '',
  street: '',
  district: '',
  city: '',
  province: '',
  postalCode: '',
  notes: '',
};

const PHONE_PATTERN = /^\+?[0-9\s-]{8,20}$/;

export function CheckoutPage() {
  const { user, loading: authLoading } = useAuth();
  const { items, subtotal, clear } = useCart();
  const { store } = useStore();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [address, setAddress] = useState<AddressForm>(emptyAddress);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof AddressForm, string>>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<{ message: string; details?: unknown } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const trackedCheckout = useRef(false);

  useEffect(() => {
    if (user && items.length > 0 && !trackedCheckout.current) {
      trackedCheckout.current = true;
      track('checkout_started');
    }
  }, [user, items.length]);

  const cities = store?.areas.flatMap((area) =>
    area.cities.map((city) => ({ city, province: area.province, area: area.name })),
  ) ?? [];

  const invalidateQuote = () => {
    setQuote(null);
    setQuoteError(null);
    setRequiresConfirmation(false);
    setAgreed(false);
    setOrderError(null);
  };

  const updateAddress = (field: keyof AddressForm, value: string) => {
    setAddress((current) => {
      const next = { ...current, [field]: value };
      if (field === 'city') {
        const found = cities.find((entry) => entry.city === value);
        if (found) next.province = found.province;
      }
      return next;
    });
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (quote) invalidateQuote();
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof AddressForm, string>> = {};
    if (address.recipient.trim().length < 2) errors.recipient = 'Nama penerima wajib diisi.';
    if (!PHONE_PATTERN.test(address.phone.trim())) errors.phone = 'Nomor telepon tidak valid.';
    if (address.street.trim().length < 5) errors.street = 'Alamat jalan wajib diisi minimal 5 karakter.';
    if (!address.city) errors.city = 'Pilih kota yang termasuk area layanan.';
    if (!address.province) errors.province = 'Provinsi belum terisi.';
    if (!/^\d{5}$/.test(address.postalCode.trim())) errors.postalCode = 'Kode pos harus 5 digit.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const addressPayload = (): Address => ({
    recipient: address.recipient.trim(),
    phone: address.phone.trim(),
    street: address.street.trim(),
    ...(address.district.trim() ? { district: address.district.trim() } : {}),
    city: address.city,
    province: address.province,
    postalCode: address.postalCode.trim(),
    ...(address.notes.trim() ? { notes: address.notes.trim() } : {}),
  });

  const requestQuote = async () => {
    if (!validate() || items.length === 0) return;
    setQuoting(true);
    setQuoteError(null);
    setOrderError(null);
    try {
      const response = await api.post<{ quote: Quote }>('/checkout/quote', {
        items: items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
        address: addressPayload(),
      });
      setQuote(response.quote);
      setRequiresConfirmation(false);
      setAgreed(false);
    } catch (error) {
      setQuote(null);
      const details = error instanceof ApiError ? error.details : undefined;
      setQuoteError({ message: apiErrorMessage(error), details });
    } finally {
      setQuoting(false);
    }
  };

  const submitOrder = async () => {
    if (!quote || !quote.payable || (requiresConfirmation && !agreed)) return;
    setSubmitting(true);
    setOrderError(null);
    try {
      const response = await api.post<{
        order: OrderDetail;
        payment: PaymentInfo | null;
        paymentError: { code: string; message: string } | null;
      }>(
        '/orders',
        {
          items: items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
          address: addressPayload(),
          quoteHash: quote.quoteHash,
        },
        { 'Idempotency-Key': idempotencyKey.current },
      );
      clear();
      const orderNumber = response.order.orderNumber;
      if (response.payment?.redirectUrl) {
        window.location.assign(response.payment.redirectUrl);
        return;
      }
      if (response.payment?.uncertain) {
        notify('Pembayaran sedang diperiksa. Status pesanan akan diperbarui dari server.');
      } else if (response.paymentError) {
        notify('Pesanan dibuat, tetapi pembayaran belum dimulai. Coba lagi dari halaman pesanan.', 'error');
      }
      navigate(`/akun/pesanan/${orderNumber}${response.payment?.uncertain ? '?checking=1' : ''}`);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'QUOTE_CHANGED') {
          const latest = (error.details as { quote?: Quote } | undefined)?.quote;
          if (latest) setQuote(latest);
          setRequiresConfirmation(true);
          setAgreed(false);
          idempotencyKey.current = crypto.randomUUID();
          setOrderError('Harga, stok, atau ongkir berubah. Periksa ringkasan terbaru lalu konfirmasi ulang.');
        } else if (error.code === 'OUT_OF_STOCK') {
          const latest = (error.details as { quote?: Quote } | undefined)?.quote;
          if (latest) setQuote(latest);
          const issues = (error.details as { issues?: Array<{ message: string }> } | undefined)?.issues;
          setOrderError(
            issues?.length
              ? issues.map((issue) => issue.message).join(' ')
              : 'Stok tidak mencukupi. Periksa jumlah di keranjang.',
          );
          idempotencyKey.current = crypto.randomUUID();
        } else if (error.code === 'SHIPPING_UNAVAILABLE') {
          setOrderError(error.message);
        } else if (error.code === 'IDEMPOTENCY_CONFLICT') {
          idempotencyKey.current = crypto.randomUUID();
          setOrderError('Permintaan checkout berubah. Periksa ringkasan lalu coba lagi.');
        } else {
          setOrderError(apiErrorMessage(error));
        }
      } else {
        setOrderError(apiErrorMessage(error));
      }
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="container page">
        <p role="status">Memuat sesi…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Seo title="Checkout — Teduh" noIndex />
        <div className="container page page--narrow">
          <p className="eyebrow">Checkout</p>
          <h1>Masuk untuk melanjutkan.</h1>
          <p>
            Keranjangmu tetap tersimpan di perangkat ini. Masuk atau buat akun untuk menghitung
            ongkir dan menyimpan pesanan.
          </p>
          <div className="hero__actions">
            <Link to="/masuk?next=%2Fcheckout" className="btn">
              Masuk
            </Link>
            <Link to="/daftar?next=%2Fcheckout" className="btn btn--secondary">
              Buat akun
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container page page--narrow">
        <h1>Keranjang kosong</h1>
        <p>Tambahkan produk sebelum melanjutkan ke checkout.</p>
        <Link to="/katalog" className="btn">
          Lihat katalog
        </Link>
      </div>
    );
  }

  const shippingUnavailable =
    quoteError &&
    (quoteError.details as { reason?: string } | undefined)?.reason;
  const contact = store?.contact;

  return (
    <>
      <Seo title="Checkout — Teduh" description="Konfirmasi alamat, ongkir, dan total pesanan." noIndex />
      <div className="container page checkout-page">
        <header className="page-head">
          <p className="eyebrow">Checkout</p>
          <h1>Konfirmasi pesanan</h1>
          <p className="page-head__lead">
            Masuk sebagai {user.email}. Isi alamat, hitung ongkir, lalu periksa total sebelum membayar.
          </p>
        </header>

        <div className="checkout-layout">
          <form
            className="checkout-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void requestQuote();
            }}
          >
            <section className="form-section" aria-labelledby="alamat-heading">
              <h2 id="alamat-heading">Alamat pengiriman</h2>
              <p className="muted">Satu alamat dan satu pengiriman untuk pesanan ini.</p>
              <div className="form-grid">
                <Field id="recipient" label="Nama penerima" error={fieldErrors.recipient}>
                  <input
                    id="recipient"
                    value={address.recipient}
                    onChange={(event) => updateAddress('recipient', event.target.value)}
                    autoComplete="name"
                    aria-invalid={Boolean(fieldErrors.recipient)}
                    aria-describedby={fieldErrors.recipient ? 'recipient-error' : undefined}
                  />
                </Field>
                <Field id="phone" label="Nomor telepon" error={fieldErrors.phone}>
                  <input
                    id="phone"
                    value={address.phone}
                    onChange={(event) => updateAddress('phone', event.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+62…"
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                  />
                </Field>
                <Field id="street" label="Alamat jalan dan nomor" error={fieldErrors.street} wide>
                  <textarea
                    id="street"
                    value={address.street}
                    onChange={(event) => updateAddress('street', event.target.value)}
                    rows={3}
                    autoComplete="street-address"
                    aria-invalid={Boolean(fieldErrors.street)}
                    aria-describedby={fieldErrors.street ? 'street-error' : undefined}
                  />
                </Field>
                <Field id="city" label="Kota / kabupaten" error={fieldErrors.city}>
                  <select
                    id="city"
                    value={address.city}
                    onChange={(event) => updateAddress('city', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.city)}
                    aria-describedby={fieldErrors.city ? 'city-error' : 'city-hint'}
                  >
                    <option value="">Pilih kota</option>
                    {cities.map((entry) => (
                      <option value={entry.city} key={`${entry.area}-${entry.city}`}>
                        {entry.city} — {entry.province}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="postalCode" label="Kode pos" error={fieldErrors.postalCode}>
                  <input
                    id="postalCode"
                    value={address.postalCode}
                    onChange={(event) => updateAddress('postalCode', event.target.value)}
                    inputMode="numeric"
                    maxLength={5}
                    autoComplete="postal-code"
                    aria-invalid={Boolean(fieldErrors.postalCode)}
                    aria-describedby={fieldErrors.postalCode ? 'postalCode-error' : 'city-hint'}
                  />
                </Field>
                <Field id="province" label="Provinsi" error={fieldErrors.province}>
                  <input
                    id="province"
                    value={address.province}
                    onChange={(event) => updateAddress('province', event.target.value)}
                    autoComplete="address-level1"
                    aria-invalid={Boolean(fieldErrors.province)}
                    aria-describedby={fieldErrors.province ? 'province-error' : undefined}
                  />
                </Field>
                <Field id="district" label="Kecamatan (opsional)">
                  <input
                    id="district"
                    value={address.district}
                    onChange={(event) => updateAddress('district', event.target.value)}
                    autoComplete="address-level3"
                  />
                </Field>
                <Field id="notes" label="Catatan alamat (opsional)" wide>
                  <textarea
                    id="notes"
                    value={address.notes}
                    onChange={(event) => updateAddress('notes', event.target.value)}
                    rows={2}
                    maxLength={300}
                  />
                </Field>
              </div>
              <p className="field-hint" id="city-hint">
                Hanya kota yang tampil di daftar yang termasuk zona layanan demo. Ongkir dihitung
                dari kode pos dan kelas kirim.
              </p>
              <button type="submit" className="btn btn--secondary" disabled={quoting}>
                {quoting ? 'Menghitung ongkir…' : 'Cek ongkir'}
              </button>
            </section>

            <section className="form-section" aria-labelledby="ringkasan-heading">
              <h2 id="ringkasan-heading">Ringkasan dari server</h2>
              {quoteError ? (
                <div className="alert alert--error" role="alert">
                  <p>{quoteError.message}</p>
                  {shippingUnavailable && contact ? (
                    <p>
                      Hubungi <a href={`mailto:${contact.email}`}>{contact.email}</a> atau{' '}
                      <a
                        href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp {contact.whatsapp}
                      </a>{' '}
                      untuk memeriksa cakupan pengiriman.
                    </p>
                  ) : null}
                  {!quote ? (
                    <p className="muted">Perbaiki alamat atau isi keranjang lalu hitung ulang.</p>
                  ) : null}
                </div>
              ) : null}

              {!quote ? (
                <p className="muted" role="status">
                  {quoting ? 'Meminta ringkasan terbaru…' : 'Tekan “Cek ongkir” untuk melihat total sebelum bayar.'}
                </p>
              ) : (
                <>
                  {!quote.payable ? (
                    <div className="alert alert--error" role="alert">
                      <p>Ringkasan belum dapat dibayar. Periksa masalah berikut:</p>
                      <ul>
                        {quote.issues.map((issue) => (
                          <li key={`${issue.code}-${issue.sku}`}>{issue.message}</li>
                        ))}
                      </ul>
                      <Link to="/keranjang" className="link-arrow">
                        Periksa keranjang <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  ) : null}

                  <div className="quote-lines">
                    {quote.items.map((line) => (
                      <div className="quote-line" key={line.sku}>
                        <span>
                          {line.productName} — {line.variantLabel} × {line.quantity}
                        </span>
                        <span>{formatRupiah(line.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                  <dl className="totals">
                    <div>
                      <dt>Subtotal</dt>
                      <dd>{formatRupiah(quote.totals.subtotal)}</dd>
                    </div>
                    {quote.shipping.classes.map((line) => (
                      <div key={line.shippingClass}>
                        <dt>Ongkir {line.label}</dt>
                        <dd>{formatRupiah(line.amount)}</dd>
                      </div>
                    ))}
                    <div>
                      <dt>Zona</dt>
                      <dd>{quote.shipping.zoneName}</dd>
                    </div>
                    <div className="totals__grand">
                      <dt>Total</dt>
                      <dd>{formatRupiah(quote.totals.grandTotal)}</dd>
                    </div>
                  </dl>
                  {quote.shipping.estimatedDays ? (
                    <p className="muted">
                      Estimasi {quote.shipping.estimatedDays.min}–{quote.shipping.estimatedDays.max} hari
                      kerja, berdasarkan tarif terkonfirmasi.
                    </p>
                  ) : (
                    <p className="muted">Estimasi hari belum tersedia untuk zona ini.</p>
                  )}

                  {requiresConfirmation ? (
                    <div className="alert alert--warning" role="alert">
                      <p>{orderError}</p>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={agreed}
                          onChange={(event) => setAgreed(event.target.checked)}
                        />
                        <span>Saya sudah memeriksa ringkasan terbaru.</span>
                      </label>
                    </div>
                  ) : null}

                  {orderError && !requiresConfirmation ? (
                    <div className="alert alert--error" role="alert">
                      {orderError}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="btn btn--full"
                    disabled={!quote.payable || submitting || (requiresConfirmation && !agreed)}
                    onClick={() => void submitOrder()}
                  >
                    {submitting ? 'Membuat pesanan…' : 'Bayar sekarang'}
                  </button>
                  <p className="muted checkout-form__fineprint">
                    Dengan menekan “Bayar sekarang”, pesanan dan reservasi stok dibuat, lalu kamu
                    diarahkan ke halaman pembayaran. Total tidak dapat diubah setelah pesanan dibuat.
                  </p>
                  {store?.paymentAdapter === 'simulation' ? (
                    <p className="alert alert--info" role="note">
                      Mode simulasi pengembangan: tidak ada uang yang diproses. Setelah pesanan
                      dibuat, halaman simulasi menampilkan pilihan hasil pembayaran.
                    </p>
                  ) : null}
                  {store?.paymentChannels.length ? (
                    <p className="muted">
                      Kanal aktif di akun merchant: {store.paymentChannels.join(', ')}.
                    </p>
                  ) : null}
                </>
              )}
            </section>
          </form>

          <aside className="checkout-summary" aria-label="Ringkasan pembayaran">
            <h2>Pesananmu</h2>
            <ul className="checkout-summary__items">
              {items.map((item) => (
                <li key={item.sku}>
                  <span className="checkout-summary__media">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" width={800} height={600} loading="lazy" />
                    ) : null}
                  </span>
                  <span>
                    <strong>{item.productName}</strong>
                    <span className="muted">
                      {item.variantLabel} · {item.quantity}×
                    </span>
                  </span>
                  <span>{formatRupiah(item.unitPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatRupiah(subtotal)}</dd>
              </div>
              <div>
                <dt>Ongkir</dt>
                <dd>{quote ? formatRupiah(quote.totals.shipping) : 'Belum dihitung'}</dd>
              </div>
              <div className="totals__grand">
                <dt>Total</dt>
                <dd>{quote ? formatRupiah(quote.totals.grandTotal) : formatRupiah(subtotal)}</dd>
              </div>
            </dl>
            <p className="muted">
              Ringkasan akhir mengikuti hasil perhitungan server. Perubahan harga atau ongkir
              memerlukan konfirmasi ulang.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}

function Field({
  id,
  label,
  error,
  wide,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field ${wide ? 'field--wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
