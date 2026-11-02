import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export function shippingRateMode(): 'store' | 'shiprocket' {
  const mode = process.env.SHIPPING_RATE_MODE || 'store';
  if (mode !== 'store' && mode !== 'shiprocket') throw new ServiceUnavailableException('Delivery settings need updating. Please contact the store.');
  return mode;
}

export function checkoutRatesEnabled() {
  return process.env.SHIPROCKET_CHECKOUT_ENABLED !== 'false'
    && (shippingRateMode() === 'store' || process.env.SHIPROCKET_CHECKOUT_ENABLED === 'true');
}

export interface StoreDeliveryRate {
  zone: 'local' | 'regional' | 'interstate';
  weightGrams: number;
  slabGrams: number;
  slabs: number;
  ratePaise: number;
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
const prefixes = (value: string) => value.split(',').map(part => part.trim()).filter(Boolean);

export function packWeightGrams(size: string, shippingWeight?: number): number {
  if (shippingWeight !== undefined && shippingWeight > 0 && Number.isFinite(shippingWeight)) return Math.ceil(shippingWeight);
  const match = size.trim().match(/^(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|g|gm|gms|grams?)$/i);
  if (!match) throw new ServiceUnavailableException('The weight of a selected pack needs updating. Please contact the store.');
  const grams = Math.ceil(Number(match[1]) * (/^k/i.test(match[2]!) ? 1000 : 1));
  if (!Number.isSafeInteger(grams) || grams <= 0) throw new ServiceUnavailableException('The weight of a selected pack needs updating. Please contact the store.');
  return grams;
}

export function storeDeliveryRate(address: { city: string; state: string; pin: string }, weightGrams: number) {
  if (!Number.isSafeInteger(weightGrams) || weightGrams <= 0 || weightGrams > 1_000_000) throw new BadRequestException('This package requires a delivery arrangement with the store');
  const originCity = normalize(process.env.STORE_SHIPPING_ORIGIN_CITY || 'Hisar');
  const originState = normalize(process.env.STORE_SHIPPING_ORIGIN_STATE || 'Haryana');
  const localPrefixes = prefixes(process.env.STORE_SHIPPING_LOCAL_PIN_PREFIXES || '125');
  const regionalPrefixes = prefixes(process.env.STORE_SHIPPING_REGIONAL_PIN_PREFIXES || '12,13');
  const pin = address.pin.trim();
  if (!/^[1-9]\d{5}$/.test(pin)) throw new BadRequestException('Enter a valid six-digit delivery PIN code');
  const sameState = normalize(address.state) === originState || (originState === 'haryana' && normalize(address.state) === 'hr');
  const regionalPin = regionalPrefixes.some(prefix => pin.startsWith(prefix));
  // Prevent an interstate address receiving a local charge just by changing
  // its city/state labels. These prefixes are merchant-configurable zones.
  if (sameState !== regionalPin) throw new BadRequestException('Delivery state and PIN code do not match. Please check your address.');
  const city = normalize(address.city);
  const sameCity = city === originCity || (originCity === 'hisar' && city === 'hissar');
  const zone = sameState ? (sameCity && localPrefixes.some(prefix => pin.startsWith(prefix)) ? 'local' : 'regional') : 'interstate';
  const slabGrams = zone === 'local' ? 500 : zone === 'regional' ? 3000 : 1000;
  const defaultRate = zone === 'local' ? 5000 : zone === 'regional' ? 10000 : 15000;
  const ratePaise = Number(process.env[`STORE_SHIPPING_${zone.toUpperCase()}_RATE_PAISE`] ?? defaultRate);
  const slabs = Math.ceil(weightGrams / slabGrams);
  const shippingPaise = slabs * ratePaise;
  if (!Number.isSafeInteger(ratePaise) || ratePaise <= 0 || !Number.isSafeInteger(shippingPaise)) throw new ServiceUnavailableException('Delivery settings need updating. Please contact the store.');
  const rate: StoreDeliveryRate = { zone, weightGrams, slabGrams, slabs, ratePaise };
  return { rate, option: { courierId: 1, name: `${zone[0]!.toUpperCase()}${zone.slice(1)} delivery`, shippingPaise, estimatedDays: '' } };
}
