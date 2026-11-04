// Native child process: kill the worker at a real persistence boundary. This
// helper accepts only a disposable loopback database supplied by the test.
if (process.env.NODE_ENV !== 'test' || !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(process.env.MONGODB_URI || '')) throw new Error('Disposable local test database required');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true } }).outputText, filename);
};
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { getModelToken } = require('@nestjs/mongoose');
const { AppModule } = require('../../src/app.module.ts');
const { OrderService } = require('../../src/orders/order.service.ts');
const { CouponsService } = require('../../src/coupons/coupons.service.ts');
const { ShippingService } = require('../../src/shipping/shipping.service.ts');
const { ShiprocketClient } = require('../../src/shipping/shiprocket.client.ts');
const { ShiprocketShipment } = require('../../src/shipping/shipping.schema.ts');
function crash() { process.kill(process.pid, 'SIGKILL'); }
process.once('message', async input => {
  let app;
  try {
    const provider = { configured: true, request: async (path, _method, body) => {
      if (input.stage !== 'provider' || path !== 'orders/create/adhoc') throw new Error('Unexpected provider call');
      // A separate committed collection stands in for provider-side success.
      await app.get(getModelToken(ShiprocketShipment.name)).db.collection('audit_provider_bookings').insertOne({ reference: body.order_id, order_id: 8100, shipment_id: 8101 });
      crash();
    } };
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ShiprocketClient).useValue(provider).compile();
    app = fixture.createNestApplication(); await app.init();
    if (input.stage === 'coupon') {
      const coupons = app.get(CouponsService), redeem = coupons.redeem.bind(coupons);
      coupons.redeem = async (...args) => { await redeem(...args); crash(); };
      await app.get(OrderService).createOrder(input.body);
    } else {
      if (input.stage === 'intent') {
        const shipments = app.get(getModelToken(ShiprocketShipment.name)), create = shipments.create.bind(shipments);
        shipments.create = async (...args) => { await create(...args); crash(); };
      }
      await app.get(ShippingService).action(input.orderId, 'create', {}, 'crash-fixture');
    }
    throw new Error('Crash checkpoint was not reached');
  } catch (error) {
    if (process.connected) process.send({ error: error.message });
    await app?.close(); process.exit(1);
  }
});
