import { Module } from '@nestjs/common';
import Stripe from 'stripe';
import { AppConfig } from '@/config/app-config.service';
import { BusinessModule } from '@/modules/business/business.module';
import { CatalogModule } from '@/modules/catalog/catalog.module';
import { CommissionsModule } from '@/modules/commissions/commissions.module';
import { SchedulingModule } from '@/modules/scheduling/scheduling.module';
import { AdminOrdersService } from './application/admin-orders.service';
import { CartService } from './application/cart.service';
import { CatalogItems } from './application/catalog-items';
import { CheckoutService } from './application/checkout.service';
import { CounterService } from './application/counter.service';
import { CustomerOrdersService } from './application/customer-orders.service';
import { OrderJobsService } from './application/order-jobs.service';
import { OrderViews } from './application/order-views';
import { StaffOrdersService } from './application/staff-orders.service';
import { OrderRepository, PaymentGateway } from './domain/ports';
import { FakePaymentGateway } from './infrastructure/gateways/fake-payment.gateway';
import { StripePaymentGateway } from './infrastructure/gateways/stripe-payment.gateway';
import { PrismaOrderRepository } from './infrastructure/prisma-order.repository';
import { CartController, CheckoutController, CustomerOrdersController } from './presentation/customer.controllers';
import { AdminOrdersController, CounterController, StaffOrdersController } from './presentation/staff.controllers';
import { StripeWebhookController } from './presentation/stripe-webhook.controller';

/** Pedidos e pagamentos: carrinho, checkout, atendimento, balcão e administração. */
@Module({
  imports: [BusinessModule, CatalogModule, SchedulingModule, CommissionsModule],
  controllers: [
    CartController,
    CheckoutController,
    CustomerOrdersController,
    StaffOrdersController,
    CounterController,
    AdminOrdersController,
    StripeWebhookController,
  ],
  providers: [
    CartService,
    CheckoutService,
    CustomerOrdersService,
    StaffOrdersService,
    CounterService,
    AdminOrdersService,
    OrderJobsService,
    OrderViews,
    CatalogItems,
    { provide: OrderRepository, useClass: PrismaOrderRepository },
    {
      provide: PaymentGateway,
      inject: [AppConfig],
      useFactory: (config: AppConfig): PaymentGateway => {
        const key = config.get('STRIPE_SECRET_KEY');
        return key ? new StripePaymentGateway(new Stripe(key)) : new FakePaymentGateway();
      },
    },
  ],
  exports: [OrderViews, OrderRepository],
})
export class OrderingModule {}
