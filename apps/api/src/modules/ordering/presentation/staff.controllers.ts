import { Body, Controller, Get, Header, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Actor, CurrentUser, Roles } from '@/shared/presentation/auth';
import { ZodPipe } from '@/shared/presentation/zod';
import { adminOrdersQuery, AdminOrdersQuery, AdminOrdersService } from '../application/admin-orders.service';
import { CounterService, counterPaymentInput, deliverInput } from '../application/counter.service';
import { addItemsInput, completeInput, StaffOrdersService, walkInInput } from '../application/staff-orders.service';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

@Controller('staff')
@Roles('BARBER')
export class StaffOrdersController {
  constructor(private readonly staff: StaffOrdersService) {}

  @Get('agenda')
  agenda(@CurrentUser() actor: Actor, @Query('date', new ZodPipe(date)) day?: string) {
    return this.staff.agenda(actor, day);
  }

  @Get('orders/lookup')
  lookup(@CurrentUser() actor: Actor, @Query('code') code = '') {
    return this.staff.lookup(actor, code);
  }

  @Post('orders/start')
  start(
    @CurrentUser() actor: Actor,
    @Body(new ZodPipe(z.object({ code: z.string().optional(), orderId: z.string().optional() }))) body: { code?: string; orderId?: string },
  ) {
    return this.staff.start(actor, body);
  }

  @Get('orders/:id')
  detail(@CurrentUser() actor: Actor, @Param('id') id: string) {
    return this.staff.detail(actor, id);
  }

  @Post('orders/:id/items')
  addItems(@CurrentUser() actor: Actor, @Param('id') id: string, @Body(new ZodPipe(addItemsInput)) body: z.infer<typeof addItemsInput>) {
    return this.staff.addItems(actor, id, body);
  }

  @Post('orders/:id/items/:itemId/done')
  markDone(@CurrentUser() actor: Actor, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.staff.markDone(actor, id, itemId);
  }

  @Post('orders/:id/pause')
  pause(@CurrentUser() actor: Actor, @Param('id') id: string, @Body(new ZodPipe(z.object({ paused: z.boolean() }))) body: { paused: boolean }) {
    return this.staff.pause(actor, id, body.paused);
  }

  @Get('orders/:id/completion')
  completion(@CurrentUser() actor: Actor, @Param('id') id: string) {
    return this.staff.completionPreview(actor, id);
  }

  @Post('orders/:id/complete')
  complete(@CurrentUser() actor: Actor, @Param('id') id: string, @Body(new ZodPipe(completeInput)) body: z.infer<typeof completeInput>) {
    return this.staff.complete(actor, id, body);
  }

  @Post('walk-ins')
  walkIn(@CurrentUser() actor: Actor, @Body(new ZodPipe(walkInInput)) body: z.infer<typeof walkInInput>) {
    return this.staff.walkIn(actor, body);
  }
}

@Controller('counter')
@Roles('RECEPTIONIST')
export class CounterController {
  constructor(
    private readonly counter: CounterService,
    private readonly staff: StaffOrdersService,
  ) {}

  @Get('today')
  today(@Query('q') q?: string) {
    return this.counter.today(q);
  }

  @Get('orders/:code')
  order(@Param('code') code: string) {
    return this.counter.order(code);
  }

  @Post('orders/:id/payments')
  pay(@CurrentUser() actor: Actor, @Param('id') id: string, @Body(new ZodPipe(counterPaymentInput)) body: z.infer<typeof counterPaymentInput>) {
    return this.counter.recordPayment(actor, id, body);
  }

  @Post('orders/:id/deliver')
  deliver(@CurrentUser() actor: Actor, @Param('id') id: string, @Body(new ZodPipe(deliverInput)) body: z.infer<typeof deliverInput>) {
    return this.counter.deliver(actor, id, body);
  }

  @Get('barbers')
  barbers(@Query('duration') duration = '40') {
    return this.counter.barbersFree(Math.max(5, Number(duration) || 40));
  }

  @Post('walk-ins')
  walkIn(@CurrentUser() actor: Actor, @Body(new ZodPipe(walkInInput)) body: z.infer<typeof walkInInput>) {
    return this.staff.walkIn(actor, body);
  }
}

@Controller('admin')
@Roles('RECEPTIONIST')
export class AdminOrdersController {
  constructor(private readonly admin: AdminOrdersService) {}

  @Get('orders')
  list(@Query(new ZodPipe(adminOrdersQuery)) q: AdminOrdersQuery) {
    return this.admin.list(q);
  }

  @Get('orders.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(@Query(new ZodPipe(adminOrdersQuery)) q: AdminOrdersQuery, @Res() res: Response) {
    res.setHeader('Content-Disposition', 'attachment; filename="pedidos-brave-barber.csv"');
    res.send(await this.admin.exportCsv(q));
  }

  @Get('orders/:code')
  detail(@Param('code') code: string) {
    return this.admin.detail(code);
  }

  @Post('orders/:code/refund')
  refund(@CurrentUser() actor: Actor, @Param('code') code: string) {
    return this.admin.refund(actor, code);
  }

  @Post('orders/:code/receipt')
  receipt(@CurrentUser() actor: Actor, @Param('code') code: string) {
    return this.admin.resendReceipt(actor, code);
  }

  @Get('agenda')
  agenda(@Query('date', new ZodPipe(date)) day?: string, @Query('barberId') barberId?: string) {
    return this.admin.agenda(day, barberId);
  }
}
