import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { authenticator } from 'otplib';
import { createApp } from '../src/app';
import { clearMailOutbox, getMailOutbox } from '../src/lib/mailer';
import { Session } from '../src/models';
import {
  ADMIN_PASSWORD,
  Client,
  JKT_ADDRESS,
  createAdmin,
  createCustomer,
  createOrderFor,
  createProduct,
  resetDb,
  seedZones,
  teardownDb,
  testGateway,
} from './helpers';

afterAll(teardownDb);
const app = createApp({ gateway: testGateway });

beforeEach(async () => {
  await resetDb();
  testGateway.transactions.clear();
  testGateway.createCalls.length = 0;
  clearMailOutbox();
});

describe('keamanan sesi dan CSRF', () => {
  it('menolak mutasi tanpa token CSRF dan tanpa origin yang diizinkan', async () => {
    const client = new Client(app);
    await client.init();
    const noCsrf = await client.agent
      .post('/api/v1/auth/login')
      .set('origin', 'http://localhost:5173')
      .send({ email: 'a@example.com', password: 'Rahasia12345' });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('CSRF_INVALID');

    const badOrigin = await client.agent
      .post('/api/v1/auth/login')
      .set('origin', 'https://evil.example')
      .set('x-csrf-token', client.csrf)
      .send({ email: 'a@example.com', password: 'Rahasia12345' });
    expect(badOrigin.status).toBe(403);
  });

  it('mencabut sesi saat logout dan rotasi cookie HttpOnly pada login', async () => {
    const customer = await createCustomer();
    const client = new Client(app);
    await client.init();
    const login = await client.login(customer.email, customer.password);
    expect(login.status).toBe(200);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.includes('HttpOnly'))).toBe(true);
    const before = await Session.countDocuments({ revokedAt: { $exists: false } });
    expect(before).toBe(1);

    const logout = await client.post('/api/v1/auth/logout');
    expect(logout.status).toBe(204);
    const me = await client.init();
    expect(me.body.user).toBeNull();
    expect(await Session.countDocuments({ revokedAt: { $exists: false } })).toBe(0);
  });

  it('membatasi detail pesanan hanya untuk pemiliknya', async () => {
    await seedZones();
    await createProduct({ sku: 'PRIV-1', stock: 3 });
    const first = await createCustomer('satu@example.com');
    const second = await createCustomer('dua@example.com');
    const clientA = new Client(app);
    await clientA.init();
    await clientA.login(first.email, first.password);
    const { orderResponse } = await createOrderFor(clientA, 'PRIV-1');
    expect(orderResponse?.status).toBe(201);
    const orderNumber = orderResponse?.body.order.orderNumber as string;

    const clientB = new Client(app);
    await clientB.init();
    await clientB.login(second.email, second.password);
    const forbidden = await clientB.get(`/api/v1/orders/${orderNumber}`);
    expect(forbidden.status).toBe(404);
    expect(JSON.stringify(forbidden.body)).not.toContain('PRIV-1');
    const list = await clientB.get('/api/v1/orders');
    expect(list.body.total).toBe(0);
  });
});

describe('akun dan reset kata sandi', () => {
  it('memberi respons reset yang seragam dan token hanya dapat dipakai sekali', async () => {
    const customer = await createCustomer('reset@example.com', 'Rahasia12345');
    const client = new Client(app);
    await client.init();
    await client.login(customer.email, customer.password);

    const unknown = new Client(app);
    await unknown.init();
    const unknownResponse = await unknown.post('/api/v1/auth/forgot-password', {
      email: 'tidak-ada@example.com',
    });
    expect(unknownResponse.status).toBe(204);
    const knownResponse = await client.post('/api/v1/auth/forgot-password', { email: customer.email });
    expect(knownResponse.status).toBe(204);
    expect(knownResponse.text).toBe('');

    const outbox = getMailOutbox();
    expect(outbox).toHaveLength(1);
    const match = outbox[0]!.text.match(/token=([A-Za-z0-9_-]+)/);
    expect(match).toBeTruthy();
    const token = match![1]!;

    const reset = await client.post('/api/v1/auth/reset-password', {
      token,
      password: 'BaruRahasia123',
    });
    expect(reset.status).toBe(204);
    expect(await Session.countDocuments({ revokedAt: { $exists: false } })).toBe(0);
    const oldSession = await client.init();
    expect(oldSession.body.user).toBeNull();

    const reusedClient = new Client(app);
    await reusedClient.init();
    const reused = await reusedClient.post('/api/v1/auth/reset-password', {
      token,
      password: 'LainRahasia123',
    });
    expect(reused.status).toBe(400);
    expect(reused.body.error.code).toBe('RESET_INVALID');

    const oldClient = new Client(app);
    await oldClient.init();
    const oldLogin = await oldClient.login(customer.email, 'Rahasia12345');
    expect(oldLogin.status).toBe(401);
    const newClient = new Client(app);
    await newClient.init();
    const newLogin = await newClient.login(customer.email, 'BaruRahasia123');
    expect(newLogin.status).toBe(200);
  });
});

describe('MFA dan izin admin', () => {
  it('mewajibkan TOTP untuk admin dan memisahkan izin per peran', async () => {
    const superAdmin = await createAdmin('super_admin');
    const catalogAdmin = await createAdmin('admin_catalog');
    const customer = await createCustomer();

    const superClient = new Client(app);
    await superClient.init();
    const noTotp = await superClient.login(superAdmin.email, ADMIN_PASSWORD);
    expect(noTotp.status).toBe(401);
    expect(noTotp.body.error.code).toBe('MFA_REQUIRED');
    const wrong = await superClient.login(superAdmin.email, ADMIN_PASSWORD, '000000');
    expect(wrong.status).toBe(401);
    const ok = await superClient.login(
      superAdmin.email,
      ADMIN_PASSWORD,
      authenticator.generate(superAdmin.secret),
    );
    expect(ok.status).toBe(200);
    expect(ok.body.mfaVerified).toBe(true);
    const audit = await superClient.get('/api/v1/admin/audit');
    expect(audit.status).toBe(200);

    const catalogClient = new Client(app);
    await catalogClient.init();
    await catalogClient.login(
      catalogAdmin.email,
      ADMIN_PASSWORD,
      authenticator.generate(catalogAdmin.secret),
    );
    const products = await catalogClient.get('/api/v1/admin/products');
    expect(products.status).toBe(200);
    const orders = await catalogClient.get('/api/v1/admin/orders');
    expect(orders.status).toBe(403);
    const auditDenied = await catalogClient.get('/api/v1/admin/audit');
    expect(auditDenied.status).toBe(403);

    const customerClient = new Client(app);
    await customerClient.init();
    await customerClient.login(customer.email, customer.password);
    const denied = await customerClient.get('/api/v1/admin/products');
    expect(denied.status).toBe(403);
  });

  it('menolak login admin tanpa MFA terdaftar', async () => {
    const email = 'admin-tanpa-mfa@example.com';
    const bcryptishPassword = await import('../src/lib/authCrypto').then((m) => m.hashPassword('Rahasia12345'));
    await import('../src/models').then(({ User }) =>
      User.create({ email, name: 'Tanpa MFA', passwordHash: bcryptishPassword, role: 'admin_ops' }),
    );
    const client = new Client(app);
    await client.init();
    const response = await client.login(email, 'Rahasia12345');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ADMIN_MFA_NOT_ENABLED');
  });
});

describe('pemeriksaan tipe pesanan', () => {
  it('menolak isi alamat yang tidak valid di server', async () => {
    await seedZones();
    await createProduct({ sku: 'ADDR-1', stock: 2 });
    const customer = await createCustomer();
    const client = new Client(app);
    await client.init();
    await client.login(customer.email, customer.password);
    const response = await client.post('/api/v1/checkout/quote', {
      items: [{ sku: 'ADDR-1', quantity: 1 }],
      address: { ...JKT_ADDRESS, postalCode: 'abc' },
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
