import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../lib/api';

export function safeNext(value: string | null): string {
  if (!value) return '/akun';
  if (!value.startsWith('/') || value.startsWith('//')) return '/akun';
  return value;
}

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  return (
    <>
      <Seo title="Masuk — Ruang Teduh" noIndex />
      <div className="container page page--auth">
        <div className="auth-card">
          <p className="eyebrow">Akun pelanggan</p>
          <h1>Masuk</h1>
          <p className="muted">Keranjangmu tetap tersimpan setelah masuk.</p>
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setSubmitting(true);
              try {
                await login(email.trim(), password);
                navigate(next, { replace: true });
              } catch (reason) {
                setError(apiErrorMessage(reason));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {error ? (
              <div className="alert alert--error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">Kata sandi</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn--full" disabled={submitting}>
              {submitting ? 'Memeriksa…' : 'Masuk'}
            </button>
          </form>
          <div className="auth-links">
            <Link to="/lupa-kata-sandi">Lupa kata sandi</Link>
            <Link to={`/daftar?next=${encodeURIComponent(next)}`}>Buat akun</Link>
          </div>
          <p className="auth-admin">
            Administrator? <Link to="/admin/masuk">Masuk panel admin</Link>
          </p>
        </div>
      </div>
    </>
  );
}

export function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  return (
    <>
      <Seo title="Buat akun — Ruang Teduh" noIndex />
      <div className="container page page--auth">
        <div className="auth-card">
          <p className="eyebrow">Akun pelanggan</p>
          <h1>Buat akun</h1>
          <p className="muted">Diperlukan saat checkout agar pesanan dan status pembayaran tersimpan.</p>
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              if (form.password !== form.confirm) {
                setError('Konfirmasi kata sandi tidak sama.');
                return;
              }
              setSubmitting(true);
              try {
                await register({
                  name: form.name.trim(),
                  email: form.email.trim(),
                  password: form.password,
                  ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
                });
                navigate(next, { replace: true });
              } catch (reason) {
                setError(apiErrorMessage(reason));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {error ? (
              <div className="alert alert--error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="register-name">Nama</label>
              <input
                id="register-name"
                autoComplete="name"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="register-email">Email</label>
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="register-phone">Nomor telepon (opsional)</label>
              <input
                id="register-phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="register-password">Kata sandi</label>
              <input
                id="register-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                aria-describedby="register-password-hint"
              />
              <p className="field-hint" id="register-password-hint">
                Minimal 10 karakter, memuat huruf dan angka.
              </p>
            </div>
            <div className="field">
              <label htmlFor="register-confirm">Ulangi kata sandi</label>
              <input
                id="register-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={form.confirm}
                onChange={(event) => setForm({ ...form, confirm: event.target.value })}
              />
            </div>
            <button type="submit" className="btn btn--full" disabled={submitting}>
              {submitting ? 'Membuat akun…' : 'Buat akun'}
            </button>
          </form>
          <div className="auth-links">
            <Link to={`/masuk?next=${encodeURIComponent(next)}`}>Sudah punya akun? Masuk</Link>
          </div>
        </div>
      </div>
    </>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <>
      <Seo title="Lupa kata sandi — Ruang Teduh" noIndex />
      <div className="container page page--auth">
        <div className="auth-card">
          <p className="eyebrow">Pemulihan akun</p>
          <h1>Lupa kata sandi</h1>
          <p className="muted">
            Masukkan email. Jika alamat terdaftar, kami mengirim tautan reset yang berlaku 30 menit
            dan hanya dapat dipakai sekali.
          </p>
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setSubmitting(true);
              setError(null);
              try {
                await api.post('/auth/forgot-password', { email: email.trim() });
                setMessage(
                  'Jika alamat ini terdaftar, tautan pengaturan ulang telah dikirim. Periksa kotak masuk.',
                );
              } catch (reason) {
                setError(apiErrorMessage(reason));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {message ? (
              <div className="alert alert--success" role="status">
                {message}
              </div>
            ) : null}
            {error ? (
              <div className="alert alert--error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn--full" disabled={submitting}>
              {submitting ? 'Mengirim…' : 'Kirim tautan reset'}
            </button>
          </form>
          <div className="auth-links">
            <Link to="/masuk">Kembali ke halaman masuk</Link>
          </div>
        </div>
      </div>
    </>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <Seo title="Atur ulang kata sandi — Ruang Teduh" noIndex />
      <div className="container page page--auth">
        <div className="auth-card">
          <p className="eyebrow">Pemulihan akun</p>
          <h1>Atur ulang kata sandi</h1>
          {!token ? (
            <div className="alert alert--error" role="alert">
              Tautan reset tidak memuat token. Minta tautan baru dari halaman lupa kata sandi.
            </div>
          ) : (
            <form
              className="form-stack"
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                if (password !== confirm) {
                  setError('Konfirmasi kata sandi tidak sama.');
                  return;
                }
                setSubmitting(true);
                try {
                  await api.post('/auth/reset-password', { token, password });
                  setMessage('Kata sandi diperbarui. Semua sesi lama telah dicabut.');
                  window.setTimeout(() => navigate('/masuk', { replace: true }), 1800);
                } catch (reason) {
                  setError(apiErrorMessage(reason));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {message ? (
                <div className="alert alert--success" role="status">
                  {message}
                </div>
              ) : null}
              {error ? (
                <div className="alert alert--error" role="alert">
                  {error}
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="reset-password">Kata sandi baru</label>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <p className="field-hint">Minimal 10 karakter, memuat huruf dan angka.</p>
              </div>
              <div className="field">
                <label htmlFor="reset-confirm">Ulangi kata sandi baru</label>
                <input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
              <button type="submit" className="btn btn--full" disabled={submitting}>
                {submitting ? 'Menyimpan…' : 'Simpan kata sandi'}
              </button>
            </form>
          )}
          <div className="auth-links">
            <Link to="/masuk">Kembali ke halaman masuk</Link>
          </div>
        </div>
      </div>
    </>
  );
}

export function AdminLoginPage() {
  const { user, mfaVerified, login, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next')?.startsWith('/admin') ? params.get('next')! : '/admin';
  const [form, setForm] = useState({ email: '', password: '', totp: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && mfaVerified && user.role !== 'customer') navigate(next, { replace: true });
  }, [user, mfaVerified, next, navigate]);

  return (
    <>
      <Seo title="Masuk admin — Ruang Teduh" noIndex />
      <div className="container page page--auth">
        <div className="auth-card">
          <p className="eyebrow">Akses terbatas</p>
          <h1>Masuk admin</h1>
          <p className="muted">
            Akun admin memerlukan kata sandi dan kode TOTP enam digit. Sesi admin berlaku delapan jam.
          </p>
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setSubmitting(true);
              try {
                const loggedIn = await login(form.email.trim(), form.password, form.totp.trim());
                if (loggedIn.role === 'customer') {
                  await logout();
                  setError('Akun ini tidak memiliki akses admin.');
                  return;
                }
                navigate(next, { replace: true });
              } catch (reason) {
                setError(apiErrorMessage(reason));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {error ? (
              <div className="alert alert--error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="admin-email">Email admin</label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="admin-password">Kata sandi</label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="admin-totp">Kode MFA (6 digit)</label>
              <input
                id="admin-totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={form.totp}
                onChange={(event) => setForm({ ...form, totp: event.target.value.replace(/\D/g, '') })}
              />
            </div>
            <button type="submit" className="btn btn--full" disabled={submitting}>
              {submitting ? 'Memeriksa…' : 'Masuk panel admin'}
            </button>
          </form>
          <div className="auth-links">
            <Link to="/masuk">Masuk sebagai pelanggan</Link>
          </div>
        </div>
      </div>
    </>
  );
}
