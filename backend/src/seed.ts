import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { hash } from 'bcryptjs';
import { AppModule } from './app.module';
import { Admin, AdminDocument, AdminRole } from './admin/admin.schema';
import { Product, ProductDocument } from './products/product.schema';
import { Category, CategoryDocument } from './categories/category.schema';

const SEED_CATEGORIES = [
  { name: 'Premium Nuts', slug: 'premium-nuts', description: 'Whole nuts for snacking, baking and everyday nourishment.', image: 'cat-nuts_ze0A.jpg', position: 10 },
  { name: 'Dry Fruits', slug: 'dry-fruits', description: 'Naturally sweet dried fruits and everyday pantry staples.', image: 'cat-dryfruits_ze0A.jpg', position: 20 },
  { name: 'Super Seeds', slug: 'super-seeds', description: 'Nutrient-dense seeds for meals and snacks.', image: 'cat-seeds_ze0A.png', position: 30 },
  { name: 'Spices', slug: 'spices', description: 'Aromatic whole spices for a flavourful kitchen.', image: 'cat-spices_ze0A.png', position: 40 },
] as const;

const SEED_SUBCATEGORIES = [
  ['Almonds', 'almonds', 'premium-nuts'], ['Cashews', 'cashews', 'premium-nuts'], ['Pistachios', 'pistachios', 'premium-nuts'], ['Walnuts', 'walnuts', 'premium-nuts'],
  ['Dates', 'dates', 'dry-fruits'], ['Raisins', 'raisins', 'dry-fruits'], ['Figs', 'figs', 'dry-fruits'], ['Apricots', 'apricots', 'dry-fruits'],
  ['Pumpkin Seeds', 'pumpkin-seeds', 'super-seeds'], ['Chia Seeds', 'chia-seeds', 'super-seeds'], ['Flax Seeds', 'flax-seeds', 'super-seeds'], ['Sunflower Seeds', 'sunflower-seeds', 'super-seeds'], ['Sesame Seeds', 'sesame-seeds', 'super-seeds'],
  ['Whole Spices', 'whole-spices', 'spices'],
] as const;

/**
 * The 8 products hardcoded in `frontend/src/App.jsx`, in the same order.
 * Slugs double as the catalogue's stable ids: phase 3 reuses them when the
 * storefront swaps its hardcoded list for API data. Prices are paise —
 * ₹275 is 27500 — and categories mirror the storefront's four tiles.
 */
const SEED_PRODUCTS: Array<Pick<Product, 'slug' | 'title' | 'description' | 'fullDescription' | 'pricePaise' | 'image' | 'category' | 'isActive'>> = [
  { slug: 'almonds', title: 'California Almonds', description: 'Crisp, buttery and naturally wholesome', fullDescription: 'California almonds are selected for their crisp bite, buttery flavour and naturally satisfying texture. Enjoy them as an everyday snack, add them to breakfast bowls, blend them into smoothies, or use them in baking. Store in a cool, dry place and reseal after opening to help keep every handful fresh.', pricePaise: 27500, image: 'almonds_ze0A.jpg', category: 'Premium Nuts', isActive: true },
  { slug: 'cashews', title: 'Roasted Cashews', description: 'Jumbo, golden and full of flavour', fullDescription: 'These jumbo cashews are gently roasted to bring out their rich, creamy flavour and delicate crunch. They are an easy addition to snack platters, curries, desserts and homemade trail mixes. Keep the pack tightly sealed between servings for the best flavour and texture.', pricePaise: 29900, image: 'cashews_ze0A.jpg', category: 'Premium Nuts', isActive: true },
  { slug: 'pistachios', title: 'Iranian Pistachios', description: 'Lightly salted, naturally opened', fullDescription: '', pricePaise: 34900, image: 'pistachios_ze0A.jpg', category: 'Premium Nuts', isActive: true },
  { slug: 'walnuts', title: 'Kashmiri Walnuts', description: 'Tender kernels with a mellow finish', fullDescription: '', pricePaise: 38900, image: 'walnuts_ze0A.jpg', category: 'Premium Nuts', isActive: true },
  { slug: 'dates', title: 'Medjool Dates', description: 'Caramel-rich, soft and satisfyingly sweet', fullDescription: 'Medjool dates are prized for their soft texture, caramel-like sweetness and generous size. Serve them as a naturally sweet snack, stuff them with nuts, or chop them into energy bites, cakes and breakfast recipes. Their rich flavour makes a small handful feel especially satisfying.', pricePaise: 42500, image: 'dates_ze0A.jpg', category: 'Dry Fruits', isActive: true },
  { slug: 'pumpkin', title: 'Pumpkin Seeds', description: 'Little green powerhouses for every day', fullDescription: '', pricePaise: 22000, image: 'pumpkin_seeds_ze0A.jpg', category: 'Super Seeds', isActive: true },
  { slug: 'raisins', title: 'Black Raisins', description: 'Sun-dried sweetness in every bite', fullDescription: '', pricePaise: 18900, image: 'black_raisins_ze0A.jpg', category: 'Dry Fruits', isActive: true },
  { slug: 'makhana', title: 'Himalayan Makhana', description: 'Lightly roasted, irresistibly crisp', fullDescription: '', pricePaise: 24500, image: 'makhana_ze0A.jpg', category: 'Super Seeds', isActive: true },
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
    const categories = app.get<Model<CategoryDocument>>(getModelToken(Category.name));
    const parentIds = new Map<string, unknown>();
    for (const category of SEED_CATEGORIES) {
      const saved = await categories.findOneAndUpdate(
        { slug: category.slug }, { $set: { ...category, isActive: true, parentId: null } }, { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean().exec();
      parentIds.set(category.slug, saved!._id);
    }
    for (const [name, slug, parentSlug] of SEED_SUBCATEGORIES) {
      await categories.updateOne(
        { slug }, { $set: { name, slug, parentId: parentIds.get(parentSlug), position: SEED_SUBCATEGORIES.findIndex((entry) => entry[1] === slug), isActive: true } }, { upsert: true },
      ).exec();
    }
    for (const seed of SEED_PRODUCTS) {
      const variants = [
        { size: '250g', pricePaise: seed.pricePaise, stockQuantity: 100, lowStockLimit: 10, isActive: true },
        { size: '500g', pricePaise: Math.round(seed.pricePaise * 1.9), stockQuantity: 75, lowStockLimit: 10, isActive: true },
        { size: '1kg', pricePaise: Math.round(seed.pricePaise * 3.65), stockQuantity: 50, lowStockLimit: 5, isActive: true },
      ];
      await products
        .updateOne(
          { slug: seed.slug },
          { $set: { ...seed, variants, tags: ['Natural'], status: 'active' } },
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
    Logger.log(`Seeded ${SEED_CATEGORIES.length} categories, ${SEED_SUBCATEGORIES.length} sub-categories and ${SEED_PRODUCTS.length} products`, 'Seed');
  } finally {
    await app.close();
  }
}

void run();
