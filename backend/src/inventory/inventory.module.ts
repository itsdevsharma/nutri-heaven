import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../products/product.schema';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { InventoryMovement, InventoryMovementSchema } from './inventory-movement.schema';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/**
 * `AuthModule` is imported for the same reason `ProductsModule` and
 * `CategoriesModule` import it: the controller guards with `AdminAuthGuard` +
 * `RolesGuard`, and `AdminAuthGuard` injects `JwtService`. Without it Nest
 * cannot resolve the guard and the whole application fails to boot.
 */
@Module({
  imports: [
    AuthModule,
    AdminModule,
    MongooseModule.forFeature([
      { name: InventoryMovement.name, schema: InventoryMovementSchema },
      // The overview derives stock from `products.variants[]`, so the product
      // model is registered here rather than reaching into ProductsModule.
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
