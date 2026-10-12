import { ExecutionContext, Injectable } from '@nestjs/common';
import { CustomerAuthGuard } from './customer-auth.guard';
@Injectable()
export class OptionalCustomerAuthGuard extends CustomerAuthGuard {
  override async canActivate(context: ExecutionContext) {
    if (!context.switchToHttp().getRequest().headers.authorization) return true;
    return super.canActivate(context);
  }
}
