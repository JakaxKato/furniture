import { Types } from 'mongoose';
import { SHIPPING_CLASS_LABELS, type ShippingClass } from '../config/store';
import { AppError } from '../lib/errors';
import { ShippingZone, type ShippingZoneDoc } from '../models';

export type ShippingAddress = {
  postalCode: string;
  city: string;
  province: string;
};

export type ShippingLine = {
  shippingClass: ShippingClass;
  label: string;
  amount: number;
};

export type ShippingQuote = {
  zoneId: Types.ObjectId;
  zoneCode: string;
  zoneName: string;
  zoneVersion: number;
  classes: ShippingLine[];
  total: number;
  estimatedDays: { min: number; max: number; confirmed: boolean } | null;
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function resolveZone(address: ShippingAddress): Promise<HydratedZone> {
  const postal = address.postalCode.trim();
  if (!/^\d{5}$/.test(postal)) {
    throw new AppError(422, 'SHIPPING_UNAVAILABLE', 'Kode pos tidak valid untuk area layanan.', {
      reason: 'postal_code_invalid',
    });
  }
  const zones = await ShippingZone.find({ active: true });
  const matches = zones.filter((zone) => {
    const prefixMatch = zone.postalPrefixes.some((prefix) => postal.startsWith(prefix));
    const cityMatch = zone.cities.some((city) => normalize(city) === normalize(address.city));
    const provinceMatch = normalize(zone.province) === normalize(address.province);
    return prefixMatch && cityMatch && provinceMatch;
  });
  if (matches.length === 0) {
    throw new AppError(422, 'SHIPPING_UNAVAILABLE', 'Alamat belum termasuk area layanan.', {
      reason: 'zone_not_found',
    });
  }
  matches.sort((a, b) => {
    const aLongest = Math.max(...a.postalPrefixes.map((p) => p.length));
    const bLongest = Math.max(...b.postalPrefixes.map((p) => p.length));
    return bLongest - aLongest;
  });
  return matches[0] as HydratedZone;
}

type HydratedZone = InstanceType<typeof ShippingZone> & ShippingZoneDoc;

export function quoteForZone(zone: HydratedZone, classes: ShippingClass[]): ShippingQuote {
  const unique = [...new Set(classes)].sort();
  const lines: ShippingLine[] = [];
  const missing: ShippingClass[] = [];
  for (const shippingClass of unique) {
    const rate = zone.rates.find((item) => item.shippingClass === shippingClass);
    if (!rate) {
      missing.push(shippingClass);
      continue;
    }
    lines.push({
      shippingClass,
      label: SHIPPING_CLASS_LABELS[shippingClass],
      amount: rate.price,
    });
  }
  if (missing.length > 0) {
    throw new AppError(422, 'SHIPPING_UNAVAILABLE', 'Tarif untuk salah satu kelas kirim belum tersedia.', {
      reason: 'rate_missing',
      missingClasses: missing,
    });
  }
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const etaRates = unique
    .map((shippingClass) => zone.rates.find((item) => item.shippingClass === shippingClass))
    .filter((rate): rate is NonNullable<typeof rate> => Boolean(rate));
  const confirmed = etaRates.every(
    (rate) => rate.etaConfirmed && typeof rate.etaMinDays === 'number' && typeof rate.etaMaxDays === 'number',
  );
  const estimatedDays = confirmed
    ? {
        min: Math.min(...etaRates.map((rate) => rate.etaMinDays as number)),
        max: Math.max(...etaRates.map((rate) => rate.etaMaxDays as number)),
        confirmed: true,
      }
    : null;

  return {
    zoneId: zone._id,
    zoneCode: zone.code,
    zoneName: zone.name,
    zoneVersion: zone.version,
    classes: lines,
    total,
    estimatedDays,
  };
}

export async function quoteShipping(address: ShippingAddress, classes: ShippingClass[]): Promise<ShippingQuote> {
  const zone = await resolveZone(address);
  return quoteForZone(zone, classes);
}
