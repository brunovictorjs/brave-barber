import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Money } from '@/shared/domain/money';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { SettingsService } from '@/modules/business/application/settings.service';
import { calculateCommission, CommissionLineDraft, StaffRates } from '../domain/commission-calculator';

interface OrderEventPayload {
  orderId: string;
}

export interface CommissionPreview {
  lines: (CommissionLineDraft & { label: string })[];
  totalCents: number;
  serviceCents: number;
  productCents: number;
}

/**
 * Calcula e grava as comissões. O cálculo roda quando o pedido é concluído
 * (evento de domínio) e a tela de conclusão usa a mesma regra para mostrar a
 * prévia. Mudar o percentual não altera o que já foi gravado.
 */
@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async context(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, events: { where: { type: 'started' } } },
    });
    if (!order || !order.barberId) return null;
    const sellerIds = new Set<string>([order.barberId, ...order.items.map((i) => i.addedById).filter((v): v is string => !!v)]);
    const [profiles, categoryRules, commission] = await Promise.all([
      this.prisma.staffProfile.findMany({ where: { userId: { in: [...sellerIds] }, user: { roles: { contains: 'BARBER' } } } }),
      this.prisma.commissionCategoryRule.findMany(),
      this.settings.get('commission'),
    ]);
    const rates = new Map<string, StaffRates>(profiles.map((p) => [p.userId, { serviceBps: p.serviceCommissionBps, productBps: p.productCommissionBps }]));
    const wasFitIn = order.events.some((e) => e.meta.includes('"late":true'));
    return {
      order,
      ctx: {
        barberId: order.barberId,
        items: order.items.map((i) => ({
          kind: i.kind as 'SERVICE' | 'PRODUCT',
          categoryId: i.categoryId,
          netCents: i.unitPriceCents * i.quantity - i.discountCents,
          addedById: i.addedById,
          addedByRole: i.addedByRole,
        })),
        ratesOf: (id: string) => rates.get(id),
        categoryRates: new Map(categoryRules.map((r) => [r.categoryId, r.rateBps])),
        rules: commission.rules,
        wasFitIn,
      },
    };
  }

  private label(line: CommissionLineDraft): string {
    return `${line.kind === 'SERVICE' ? 'Execução' : 'Produto'} · ${Money.formatRate(line.rateBps)} de ${Money.format(line.baseCents)}`;
  }

  /** Prévia para a tela "Concluir" (o que o barbeiro vai ganhar neste pedido). */
  async preview(orderId: string, forBarberId?: string): Promise<CommissionPreview> {
    const loaded = await this.context(orderId);
    if (!loaded) return { lines: [], totalCents: 0, serviceCents: 0, productCents: 0 };
    const lines = calculateCommission({ ...loaded.ctx, reason: 'completed' }).filter((l) => !forBarberId || l.barberId === forBarberId);
    return {
      lines: lines.map((l) => ({ ...l, label: this.label(l) })),
      totalCents: lines.reduce((s, l) => s + l.amountCents, 0),
      serviceCents: lines.filter((l) => l.kind === 'SERVICE').reduce((s, l) => s + l.amountCents, 0),
      productCents: lines.filter((l) => l.kind === 'PRODUCT').reduce((s, l) => s + l.amountCents, 0),
    };
  }

  private async persist(orderId: string, reason: 'completed' | 'no_show'): Promise<void> {
    const loaded = await this.context(orderId);
    if (!loaded) return;
    const lines = calculateCommission({ ...loaded.ctx, reason });
    await this.prisma.$transaction([
      this.prisma.commissionLine.deleteMany({ where: { orderId } }),
      this.prisma.commissionLine.createMany({ data: lines.map((l) => ({ ...l, orderId })) }),
    ]);
    this.logger.log(`Comissões do pedido ${loaded.order.code}: ${lines.map((l) => this.label(l)).join('; ') || 'nenhuma'}`);
  }

  @OnEvent('order.completed')
  async onCompleted(event: OrderEventPayload): Promise<void> {
    await this.persist(event.orderId, 'completed');
  }

  @OnEvent('order.no_show')
  async onNoShow(event: OrderEventPayload): Promise<void> {
    await this.persist(event.orderId, 'no_show');
  }

  /** Estorno: por padrão a comissão daquele pedido deixa de valer. */
  @OnEvent('order.cancelled')
  async onCancelled(event: OrderEventPayload): Promise<void> {
    const { rules } = await this.settings.get('commission');
    if (!rules.refunded) await this.prisma.commissionLine.deleteMany({ where: { orderId: event.orderId } });
  }
}
