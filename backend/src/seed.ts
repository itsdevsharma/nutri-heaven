import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { hash } from 'bcryptjs';
import { AppModule } from './app.module';
import { Admin, AdminDocument, AdminRole } from './admin/admin.schema';
import { Product, ProductDocument } from './products/product.schema';

/**
 * The 8 products hardcoded in `frontend/src/App.jsx`, in the same order.
 * Slugs double as the catalogue's stable ids: phase 3 reuses them when the
 * storefront swaps its hardcoded list for API data. Prices are paise —
 * ₹275 is 27500 — and categories mirror the storefront's four tiles.
 */
const SEED_PRODUCTS: Array<Pick<Product, 'slug' | 'title' | 'description' | 'pricePaise' | 'image' | 'category' | 'isActive'>> = [
  { slug: 'almonds', title: 'California Almonds', description: 'Crisp, buttery and naturally wholesome', pricePaise: 27500, image: 'almonds_ze0A.jpg', category: 'Premium Nuts', isActive: true },
  { slug: 'cashews', title: 'Roasted Cashews', description: 'Jumbo, golden and full of flavour', pricePaise: 29900, image: 'cashews_ze0A.jpg', category: 'Premium Nuts', isActive: true },
  { slug: 'pistachios', title: 'Iranian Pistachios', description: 'Lightly salted, naturally opened', pricePaise: 34900, image: 'pistachios_ze0A.jpg', category: 'Premium Nuts', isActive: true },
  { slug: 'walnuts', title: 'Kashmiri Walnuts', description: 'Tender kernels with a mellow finish', pricePaise: 38900, image: 'walnuts_ze0A.jpg', category: 'Premium Nuts', isActive: true },
  { slug: 'dates', title: 'Medjool Dates', description: 'Caramel-rich, soft and satisfyingly sweet', pricePaise: 42500, image: 'dates_ze0A.jpg', category: 'Dry Fruits', isActive: true },
  { slug: 'pumpkin', title: 'Pumpkin Seeds', description: 'Little green powerhouses for every day', pricePaise: 22000, image: 'pumpkin_seeds_ze0A.jpg', category: 'Super Seeds', isActive: true },
  { slug: 'raisins', title: 'Black Raisins', description: 'Sun-dried sweetness in every bite', pricePaise: 18900, image: 'black_raisins_ze0A.jpg', category: 'Dry Fruits', isActive: true },
  { slug: 'makhana', title: 'Himalayan Makhana', description: 'Lightly roasted, irresistibly crisp', pricePaise: 24500, image: 'makhana_ze0A.jpg', category: 'Super Seeds', isActive: true },
];

/**
 * Idempotent catalogue seed: re-running it updates matching slugs instead of
 * inserting duplicates, so `pnpm seed` is safe after adding new products.
 */
async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  try {
    const products = app.get<Model<ProductDocument>>(
      getModelToken(Product.name),
    );
    const admins = app.get<Model<AdminDocument>>(getModelToken(Admin.name));
    for (const seed of SEED_PRODUCTS) {
      const variants = [
        { size: '250g', pricePaise: seed.pricePaise, isActive: true },
        { size: '500g', pricePaise: Math.round(seed.pricePaise * 1.9), isActive: true },
        { size: '1kg', pricePaise: Math.round(seed.pricePaise * 3.65), isActive: true },
      ];
      await products
        .updateOne(
          { slug: seed.slug },
          { $set: { ...seed, variants, tags: ['Natural'] } },
          { upsert: true },
        )
        .exec();
    }
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      await admins.updateOne(
        { email: adminEmail },
        { $setOnInsert: { name: 'Initial administrator', email: adminEmail, passwordHash: await hash(adminPassword, 12), role: AdminRole.SUPER_ADMIN, isActive: true } },
        { upsert: true },
      ).exec();
      Logger.log(`Seeded admin ${adminEmail}`, 'Seed');
    } else {
      Logger.warn('No ADMIN_EMAIL/ADMIN_PASSWORD set; no admin account was seeded', 'Seed');
    }
    Logger.log(`Seeded ${SEED_PRODUCTS.length} products`, 'Seed');
  } finally {
    await app.close();
  }
}

void run();
