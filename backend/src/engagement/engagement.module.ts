import { Body, Controller, Get, Module, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Order, OrderSchema } from '../orders/order.schema';
import { Product, ProductSchema } from '../products/product.schema';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { AdminRequest } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminRole } from '../admin/admin.schema';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { CustomerNotification, CustomerNotificationSchema, Review, ReviewSchema, Subscriber, SubscriberSchema } from './engagement.schema';
import { NotificationService } from './notification.service';
import { EngagementService } from './engagement.service';
import { EngagementListQuery, SalesReportQuery, CreateReviewDto, ModerateReviewDto, NewsletterTokenDto, SubscribeDto } from './engagement.dto';
type CustomerRequest = { customer: { id: string; email: string } };
@Controller()
export class EngagementController {
  constructor(private readonly service: EngagementService, private readonly notifications: NotificationService) {}
  @Post('newsletter/subscribe') subscribe(@Body() dto: SubscribeDto) { return this.service.subscribe(dto.email); }
  @Post('newsletter/confirm') confirm(@Body() dto: NewsletterTokenDto) { return this.service.newsletterAction(dto.token, false); }
  @Post('newsletter/unsubscribe') unsubscribe(@Body() dto: NewsletterTokenDto) { return this.service.newsletterAction(dto.token, true); }
  @Get('reviews/:slug') reviews(@Param('slug') slug: string) { return this.service.publicReviews(slug); }
  @Post('customer/me/reviews') @UseGuards(CustomerAuthGuard) review(@Req() req: CustomerRequest, @Body() dto: CreateReviewDto) { return this.service.createReview(req.customer.id, dto); }
  @Get('customer/me/notifications') @UseGuards(CustomerAuthGuard) list(@Req() req: CustomerRequest) { return this.notifications.list(req.customer.email); }
  @Patch('customer/me/notifications/:id/read') @UseGuards(CustomerAuthGuard) read(@Req() req: CustomerRequest, @Param('id') id: string) { return this.notifications.read(req.customer.email, id); }
}
@Controller('admin/engagement')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN)
export class AdminEngagementController {
  constructor(private readonly service: EngagementService) {}
  @Get('report') report(@Query() query: SalesReportQuery) { return this.service.report(query); }
  @Get('reviews/page') reviewPage(@Query() query: EngagementListQuery) { return this.service.paginated('reviews', query); }
  @Get('subscribers/page') subscriberPage(@Query() query: EngagementListQuery) { return this.service.paginated('subscribers', query); }
  @Get('subscribers') subscribers() { return this.service.listSubscribers(); }
  @Get('reviews') reviews() { return this.service.listReviews(); }
  @Patch('reviews/:id') moderate(@Param('id') id: string, @Body() dto: ModerateReviewDto, @Req() req: AdminRequest) { return this.service.moderate(id, dto.status, req.admin!.sub); }
}
@Module({ imports: [AuthModule, AdminModule, AuditModule, MailModule, MongooseModule.forFeature([
  { name: CustomerNotification.name, schema: CustomerNotificationSchema }, { name: Subscriber.name, schema: SubscriberSchema }, { name: Review.name, schema: ReviewSchema }, { name: Customer.name, schema: CustomerSchema }, { name: Order.name, schema: OrderSchema }, { name: Product.name, schema: ProductSchema },
])], controllers: [EngagementController, AdminEngagementController], providers: [NotificationService, EngagementService, CustomerAuthGuard], exports: [NotificationService] })
export class EngagementModule {}
