import { Money } from '@/shared/domain/money';
import type { CommissionSettings } from '@/modules/business/domain/settings';

export interface CommissionItem {
  kind: 'SERVICE' | 'PRODUCT';
  categoryId: string | null;
  /** Valor líquido do item (preço × quantidade − desconto). */
  netCents: number;
  addedById: string | null;
  addedByRole: string;
}

export interface StaffRates {
  serviceBps: number;
  productBps: number;
}

export interface CommissionLineDraft {
  barberId: string;
  kind: 'SERVICE' | 'PRODUCT';
  baseCents: number;
  rateBps: number;
  amountCents: number;
}

export interface CommissionContext {
  /** Profissional que executou o atendimento. */
  barberId: string;
  items: CommissionItem[];
  ratesOf: (userId: string) => StaffRates | undefined;
  categoryRates: Map<string, number>;
  rules: CommissionSettings['rules'];
  /** O atendimento foi um encaixe de cliente atrasado. */
  wasFitIn: boolean;
  /** Motivo do cálculo. */
  reason: 'completed' | 'no_show';
}

/**
 * Comissão de um pedido:
 *  • Execução: percentual do profissional sobre o valor líquido dos serviços,
 *    salvo quando a categoria tem exceção (ex.: Coloração 45%).
 *  • Produtos: percentual de produtos de quem lançou a venda (o barbeiro, no
 *    atendimento ou no avulso). Produto comprado pelo cliente no site não paga
 *    comissão — a não ser que a casa ligue essa regra.
 *  • As chaves de "O que entra na comissão" decidem cada caso.
 */
export function calculateCommission(ctx: CommissionContext): CommissionLineDraft[] {
  const { rules } = ctx;
  if (ctx.reason === 'completed' && !rules.completed) return [];
  if (ctx.reason === 'no_show' && !rules.paidNotCompleted) return [];
  if (ctx.wasFitIn && !rules.fitIn) return [];

  const groups = new Map<string, CommissionLineDraft>();
  const add = (barberId: string, kind: 'SERVICE' | 'PRODUCT', rateBps: number, netCents: number) => {
    if (netCents <= 0 || rateBps <= 0) return;
    const key = `${barberId}|${kind}|${rateBps}`;
    const line = groups.get(key) ?? { barberId, kind, baseCents: 0, rateBps, amountCents: 0 };
    line.baseCents += netCents;
    groups.set(key, line);
  };

  const barberRates = ctx.ratesOf(ctx.barberId);
  for (const item of ctx.items) {
    if (item.kind === 'SERVICE') {
      if (!barberRates) continue;
      const rate = (item.categoryId ? ctx.categoryRates.get(item.categoryId) : undefined) ?? barberRates.serviceBps;
      add(ctx.barberId, 'SERVICE', rate, item.netCents);
      continue;
    }
    if (ctx.reason !== 'completed') continue; // produto não entregue não comissiona
    const soldByStaff = item.addedByRole !== 'CLIENT';
    if (soldByStaff) {
      if (!rules.barberProducts || !item.addedById) continue;
      const seller = ctx.ratesOf(item.addedById);
      if (!seller) continue; // lançado por quem não tem comissão (ex.: balconista)
      add(item.addedById, 'PRODUCT', seller.productBps, item.netCents);
    } else if (rules.siteProducts && barberRates) {
      add(ctx.barberId, 'PRODUCT', barberRates.productBps, item.netCents);
    }
  }

  return [...groups.values()].map((l) => ({ ...l, amountCents: Money.applyRate(l.baseCents, l.rateBps) }));
}
