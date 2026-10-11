import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Actor, CurrentUser } from '@/shared/presentation/auth';
import { ZodPipe } from '@/shared/presentation/zod';
import { addItemInput, CartService, scheduleInput } from '../application/cart.service';
import { checkoutInput, CheckoutService, testCardInput } from '../application/checkout.service';
import { CustomerOrdersService } from '../application/customer-orders.service';

@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  view(@CurrentUser() actor: Actor) {
    return this.cart.view(actor);
  }

  @Post('items')
  add(@CurrentUser() actor: Actor, @Body(new ZodPipe(addItemInput)) body: z.infer<typeof addItemInput>) {
    return this.cart.add(actor, body);
  }

  @Patch('items/:id')
  quantity(@CurrentUser() actor: Actor, @Param('id') id: string, @Body(new ZodPipe(z.object({ quantity: z.number().int() }))) body: { quantity: number }) {
    return this.cart.setQuantity(actor, id, body.quantity);
  }

  @Delete('items/:id')
  remove(@CurrentUser() actor: Actor, @Param('id') id: string) {
    return this.cart.remove(actor, id);
  }

  @Put('schedule')
  schedule(@CurrentUser() actor: Actor, @Body(new ZodPipe(scheduleInput)) body: z.infer<typeof scheduleInput>) {
    return this.cart.schedule(actor, body);
  }
}

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get('options')
  options(@CurrentUser() actor: Actor) {
    return this.checkout.options(actor);
  }

  @Post()
  create(@CurrentUser() actor: Actor, @Body(new ZodPipe(checkoutInput)) body: z.infer<typeof checkoutInput>) {
    return this.checkout.checkout(actor, body);
  }
}

const listQuery = z.object({
  tab: z.enum(['upcoming', 'history']).default('upcoming'),
  page: z.coerce.number().int().min(1).default(1),
});

@Controller('me/orders')
export class CustomerOrdersController {
  constructor(
    private readonly orders: CustomerOrdersService,
    private readonly checkout: CheckoutService,
  ) {}

  @Get()
  list(@CurrentUser() actor: Actor, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.orders.list(actor, q.tab, q.page);
  }

  @Get(':code')
  detail(@CurrentUser() actor: Actor, @Param('code') code: string) {
    return this.orders.detail(actor, code);
  }

  @Post(':code/cancel')
  cancel(@CurrentUser() actor: Actor, @Param('code') code: string) {
    return this.orders.cancel(actor, code);
  }

  @Post(':code/payment')
  retry(@CurrentUser() actor: Actor, @Param('code') code: string, @Body(new ZodPipe(checkoutInput)) body: z.infer<typeof checkoutInput>) {
    return this.checkout.retry(actor, code, body);
  }

  @Post(':code/verify')
  verify(@CurrentUser() actor: Actor, @Param('code') code: string) {
    return this.checkout.verify(actor, code);
  }

  @Post(':code/test-card')
  testCard(@CurrentUser() actor: Actor, @Param('code') code: string, @Body(new ZodPipe(testCardInput)) body: z.infer<typeof testCardInput>) {
    return this.checkout.confirmTestCard(actor, code, body);
  }
}
