import { orderConfirmationEmail } from '../src/mail/order-confirmation.template';
import type { Order } from '../src/orders/order.schema';
const order = {
  id: 'NH-TEST', customerName: '<script>Buyer</script>',
  deliveryAddress: { street: '12 Main & First', landmark: 'Near park', city: 'Hisar', state: 'Haryana', pin: '125001' },
  lines: [{ productName: '<img src=x onerror=alert(1)> Almonds', packSize: '250 g', quantity: 2, lineTotalPaise: 40000 }],
  subtotalPaise: 40000, couponDiscountPaise: 5000, shippingPaise: 4000, totalPaise: 39000,
  paymentMethod: 'cod', paymentStatus: 'pending',
} as Order;
describe('Order confirmation template', () => {
  it('includes the actual order summary, totals and address in HTML and plain text', () => {
    const email = orderConfirmationEmail(order);
    expect(email.subject).toContain(order.id);
    for (const body of [email.text, email.html]) {
      for (const value of ['NH-TEST', '250 g', 'INR 400.00', 'INR 50.00', 'INR 40.00', 'INR 390.00', '125001', 'Cash on delivery']) expect(body).toContain(value);
    }
    expect(email.html).toContain('&lt;script&gt;Buyer&lt;/script&gt;');
    expect(email.html).toContain('&lt;img'); expect(email.html).not.toContain('<script>'); expect(email.html).not.toContain('<img');
    expect(email.html).toContain('Main &amp; First');
  });
  it('does not claim that pending online payments have been received', () => {
    const email = orderConfirmationEmail({ ...order, paymentMethod: 'razorpay' });
    expect(email.text).toContain('Online payment pending'); expect(email.html).not.toContain('Payment received');
    expect(orderConfirmationEmail({ ...order, paymentStatus: 'paid' }).text).toContain('Payment received');
  });
});
