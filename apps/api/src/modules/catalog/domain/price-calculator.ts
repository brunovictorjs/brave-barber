import type { DateKey } from '@/shared/domain/business-time';
import type { Offer } from './offer';

export interface PricingLine {
  /** Identificador da linha (id do item do pedido). */
  key: string;
  kind: 'SERVICE' | 'PRODUCT';
  refId: string; // serviceId ou productId
  listPriceCents: number;
  quantity: number;
}

export interface ComboDefinition {
  comboId: string;
  comboName: string;
  componentIds: string[];
  listPriceCents: number;
}

export interface PricedLine {
  key: string;
  unitPriceCents: number;
  listPriceCents: number;
  discountCents: number;
  offerName: string | null;
}

export interface PricingResult {
  lines: PricedLine[];
  combos: { comboName: string; discountCents: number }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

/**
 * Preço de um conjunto de itens num dia:
 *  1. cada serviço sai pelo preço da oferta que vale naquele dia (ou pelo de tabela);
 *  2. se os itens fecham um combo (ex.: Corte + Barba = "Cabelo + barba"), o
 *     cliente paga o preço do combo e a diferença aparece como "Desconto combo",
 *     rateada entre os serviços que formam o combo.
 */
export function calculatePrices(
  lines: PricingLine[],
  ctx: { day: DateKey; offersByService: Map<string, Offer>; combos: ComboDefinition[] },
): PricingResult {
  const priced = new Map<string, PricedLine>();

  for (const line of lines) {
    const offer = line.kind === 'SERVICE' ? ctx.offersByService.get(line.refId) : undefined;
    const applies = offer?.appliesOn(ctx.day) ?? false;
    priced.set(line.key, {
      key: line.key,
      listPriceCents: line.listPriceCents,
      unitPriceCents: applies ? offer!.priceFor(line.listPriceCents) : line.listPriceCents,
      discountCents: 0,
      offerName: applies ? offer!.snapshot.name : null,
    });
  }

  const combos: PricingResult['combos'] = [];
  const used = new Set<string>();
  const serviceLines = lines.filter((l) => l.kind === 'SERVICE');
  const inCart = new Set(serviceLines.map((l) => l.refId));

  // Combos maiores primeiro, para dar o maior desconto possível.
  const candidates = [...ctx.combos].sort((a, b) => b.componentIds.length - a.componentIds.length);
  for (const combo of candidates) {
    if (inCart.has(combo.comboId)) continue; // o próprio combo já está no carrinho
    const parts = combo.componentIds.map((id) => serviceLines.find((l) => l.refId === id && !used.has(l.key)));
    if (parts.some((p) => !p)) continue;
    const partLines = parts as PricingLine[];

    const offer = ctx.offersByService.get(combo.comboId);
    const comboPrice = offer?.appliesOn(ctx.day) ? offer.priceFor(combo.listPriceCents) : combo.listPriceCents;
    const partsTotal = partLines.reduce((sum, l) => sum + priced.get(l.key)!.unitPriceCents, 0);
    const discount = partsTotal - comboPrice;
    if (discount <= 0) continue;

    let left = discount;
    partLines.forEach((l, index) => {
      const line = priced.get(l.key)!;
      const share = index === partLines.length - 1 ? left : Math.round((discount * line.unitPriceCents) / partsTotal);
      line.discountCents += share;
      left -= share;
      used.add(l.key);
    });
    combos.push({ comboName: combo.comboName, discountCents: discount });
  }

  const result = lines.map((l) => priced.get(l.key)!);
  const subtotalCents = lines.reduce((sum, l) => sum + priced.get(l.key)!.unitPriceCents * l.quantity, 0);
  const discountCents = result.reduce((sum, l) => sum + l.discountCents, 0);
  return { lines: result, combos, subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}
