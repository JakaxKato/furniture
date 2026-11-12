import { afterAll, describe, expect, it } from 'vitest';
import { assertRupiah } from '../src/lib/money';
import { gatewaySignature } from '../src/lib/crypto';
import { availableOf } from '../src/modules/inventory';
import { teardownDb } from './helpers';

afterAll(teardownDb);

describe('utilitas uang', () => {
  it('menerima bilangan bulat Rupiah dan menolak pecahan/negatif', () => {
    expect(assertRupiah(0)).toBe(0);
    expect(assertRupiah(2_950_000)).toBe(2_950_000);
    expect(() => assertRupiah(10.5)).toThrow();
    expect(() => assertRupiah(-1)).toThrow();
  });
});

describe('signature gateway', () => {
  it('menghasilkan hex SHA-512 yang berubah bila Server Key berubah', () => {
    const first = gatewaySignature('TDH-1', '200', '150000.00', 'server-key-a');
    const second = gatewaySignature('TDH-1', '200', '150000.00', 'server-key-b');
    expect(first).toMatch(/^[a-f0-9]{128}$/);
    expect(first).not.toBe(second);
  });
});

describe('ketersediaan inventaris', () => {
  it('mengurangi stok ditahan dan dialokasikan serta tidak pernah negatif', () => {
    expect(availableOf({ physical: 5, held: 1, allocated: 2 })).toBe(2);
    expect(availableOf({ physical: 1, held: 2, allocated: 0 })).toBe(0);
  });
});
