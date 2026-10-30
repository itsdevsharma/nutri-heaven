import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, randomUUID } from 'crypto';
import { Product } from '../products/product.schema';
import { ProductsService } from '../products/products.service';
import { CouponsService } from '../coupons/coupons.service';
import { ShiprocketClient } from '../shipping/shiprocket.client';
import { ShippingConfiguration } from '../shipping/shipping.schema';
import { CheckoutQuote, DeliveryOption, Parcel } from './checkout.schema';
import { CheckoutQuoteDto } from './checkout.dto';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
@Injectable()
export class CheckoutService {
  constructor(@InjectModel(CheckoutQuote.name) private quotes: Model<CheckoutQuote>, @InjectModel(Product.name) private products: Model<Product>, @InjectModel(ShippingConfiguration.name) private config: Model<ShippingConfiguration>, private pricing: ProductsService, private coupons: CouponsService, private client: ShiprocketClient) {}
  get enabled() { return process.env.SHIPROCKET_CHECKOUT_ENABLED === 'true'; }
  fingerprint(dto: CheckoutQuoteDto) {
    return hash({ cartId: dto.cartId, lines: dto.lines.map(line => ({ productSlug: line.productSlug, packSize: line.packSize, quantity: line.quantity })), address: Object.fromEntries(['street', 'landmark', 'city', 'state', 'pin'].map(key => [key, String((dto.deliveryAddress as any)?.[key] ?? '').trim()])), paymentMethod: dto.paymentMethod, coupon: dto.couponCode?.trim().toUpperCase() || '' });
  }
  async calculate(dto: CheckoutQuoteDto, reserved = false) {
    if (!dto.lines.length || dto.lines.length > 50) throw new BadRequestException('Choose between 1 and 50 cart lines');
    const counts = new Map<string, number>();
    for (const line of dto.lines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw new BadRequestException('Invalid quantity');
      const key = `${line.productSlug}:${line.packSize}`;
      if (counts.has(key)) throw new BadRequestException('Combine duplicate cart lines');
      counts.set(key, line.quantity);
    }
    const defaults = await this.config.findOne({ key: 'shiprocket' }).lean();
    if (!defaults || !this.client.configured) throw new ServiceUnavailableException('Delivery rates are temporarily unavailable. Please try again later.');
    const found = await this.products.find({ slug: { $in: dto.lines.map(line => line.productSlug) }, isActive: true, status: 'active' }).lean();
    let grams = 0, length = 0, breadth = 0, height = 0;
    for (const line of dto.lines) {
      const product = found.find(product => product.slug === line.productSlug);
      const variant = product?.variants.find(variant => variant.size === line.packSize && variant.isActive) as (Product['variants'][number] & { stockQuantity?: number; weightGrams?: number }) | undefined;
      if (!variant || (!reserved && (variant.stockQuantity ?? 0) < line.quantity)) throw new ConflictException('A selected pack is unavailable or has insufficient stock');
      if (!Number.isFinite(variant.weightGrams) || variant.weightGrams! <= 0) throw new ServiceUnavailableException('Delivery details for a selected pack need updating. Please contact the store.');
      grams += variant.weightGrams! * line.quantity;
      length = Math.max(length, variant.lengthCm ?? defaults.length);
      breadth = Math.max(breadth, variant.breadthCm ?? defaults.breadth);
      height += (variant.heightCm ?? defaults.height) * line.quantity;
    }
    // Deterministic single-parcel packing: stack pack boxes along height.
    // Store dimensions are the fallback for packs without dimensional metadata.
    const parcel = { pickupLocation: defaults.pickupLocation, weight: Math.max(defaults.weight, grams / 1000), length, breadth, height };
    if (![parcel.weight, parcel.length, parcel.breadth, parcel.height].every(value => Number.isFinite(value) && value > 0 && value <= 1000)) throw new BadRequestException('This package requires a delivery arrangement with the store');
    const prices = await this.pricing.quote({ lines: dto.lines.map(line => ({ slug: line.productSlug, packSize: line.packSize, quantity: line.quantity })) });
    const discount = dto.couponCode ? await this.coupons.quote(dto.couponCode, prices.subtotalPaise, prices.lines) : null;
    // Existing catalogue prices include tax. Do not add GST a second time.
    const discountPaise = discount?.discountPaise ?? 0;
    return { prices, discountPaise, parcel, pricingFingerprint: hash({ lines: prices.lines, discountPaise, parcel }) };
  }
  async rates(parcel: Parcel, pin: string, cod: boolean, valuePaise: number): Promise<DeliveryOption[]> {
    const params = new URLSearchParams({ pickup_postcode: parcel.pickupPostcode, delivery_postcode: pin, weight: String(parcel.weight), length: String(parcel.length), breadth: String(parcel.breadth), height: String(parcel.height), cod: cod ? '1' : '0', declared_value: String(valuePaise / 100) });
    let data;
    try { data = await this.client.request(`courier/serviceability/?${params}`); }
    catch { throw new ServiceUnavailableException('Could not calculate delivery rates. Please retry.'); }
    const options = (Array.isArray(data.data?.available_courier_companies) ? data.data.available_courier_companies : []).filter((item: any) => !Number(item.blocked) && (!cod || Number(item.cod) === 1) && Number.isSafeInteger(Number(item.courier_company_id)) && Number(item.courier_company_id) > 0 && item.rate !== null && item.rate !== '' && Number.isFinite(Number(item.rate)) && Number(item.rate) >= 0 && Number.isSafeInteger(Math.round(Number(item.rate) * 100))).map((item: any) => ({ courierId: Number(item.courier_company_id), name: String(item.courier_name), shippingPaise: Math.round(Number(item.rate) * 100), estimatedDays: String(item.estimated_delivery_days ?? '') }));
    if (!options.length) throw new BadRequestException('No delivery service is available for this address and package');
    return options.sort((a: DeliveryOption, b: DeliveryOption) => a.shippingPaise - b.shippingPaise);
  }
  async quote(dto: CheckoutQuoteDto) {
    if (!this.enabled) throw new BadRequestException('Shiprocket checkout is not enabled');
    const calculation = await this.calculate(dto);
    let pickup;
    try { pickup = await this.client.request('settings/company/pickup'); }
    catch { throw new ServiceUnavailableException('Could not load delivery availability. Please retry.'); }
    const postcode = String(pickup.data?.shipping_address?.find((item: any) => item.pickup_location === calculation.parcel.pickupLocation)?.pin_code ?? '');
    if (!/^\d{6}$/.test(postcode)) throw new ServiceUnavailableException('The store pickup location needs updating');
    const parcel = { ...calculation.parcel, pickupPostcode: postcode };
    const options = await this.rates(parcel, dto.deliveryAddress.pin, dto.paymentMethod === 'cod', calculation.prices.subtotalPaise - calculation.discountPaise);
    return this.quotes.create({ id: randomUUID(), cartId: dto.cartId, fingerprint: this.fingerprint(dto), pricingFingerprint: calculation.pricingFingerprint, parcel, options, lines: calculation.prices.lines, subtotalPaise: calculation.prices.subtotalPaise, discountPaise: calculation.discountPaise, taxPaise: 0, expiresAt: new Date(Date.now() + 10 * 60_000) });
  }
  async validate(dto: CheckoutQuoteDto, id?: string, courierId?: number, reserved = false) {
    const quote = id ? await this.quotes.findOne({ id, cartId: dto.cartId }).lean() : null;
    if (!quote || new Date(quote.expiresAt).getTime() <= Date.now() || quote.fingerprint !== this.fingerprint(dto)) throw new ConflictException('Delivery quote expired or checkout changed. Calculate delivery again to confirm your total.');
    const calculation = await this.calculate(dto, reserved);
    if (calculation.pricingFingerprint !== quote.pricingFingerprint) throw new ConflictException('Prices or package details changed. Calculate delivery again.');
    const selected = quote.options.find(option => option.courierId === courierId);
    if (!selected) throw new BadRequestException('Choose an available delivery option');
    const fresh = (await this.rates(quote.parcel, dto.deliveryAddress.pin, dto.paymentMethod === 'cod', quote.subtotalPaise - quote.discountPaise)).find(option => option.courierId === selected.courierId);
    if (!fresh || fresh.shippingPaise !== selected.shippingPaise) throw new ConflictException('Delivery rate changed. Calculate delivery again to confirm your total.');
    if (new Date(quote.expiresAt).getTime() <= Date.now()) throw new ConflictException('Delivery quote expired. Calculate delivery again.');
    return { quote, selected, calculation };
  }
}
