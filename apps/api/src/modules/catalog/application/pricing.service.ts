import { Injectable } from '@nestjs/common';
import type { DateKey } from '@/shared/domain/business-time';
import { calculatePrices, ComboDefinition, PricingLine, PricingResult } from '../domain/price-calculator';
import { Offer } from '../domain/offer';
import { OfferRepository, ServiceRepository } from '../domain/repositories';

/**
 * Fachada de preços usada pelos pedidos: aplica ofertas do dia e combos.
 * O módulo de pedidos não conhece ofertas — só recebe o preço de cada linha.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly offers: OfferRepository,
    private readonly services: ServiceRepository,
  ) {}

  async offersByService(): Promise<Map<string, Offer>> {
    const map = new Map<string, Offer>();
    for (const offer of await this.offers.findOpen()) {
      for (const id of offer.snapshot.serviceIds) if (!map.has(id)) map.set(id, offer);
    }
    return map;
  }

  async combos(): Promise<ComboDefinition[]> {
    const combos = await this.services.activeCombos();
    return combos.map((c) => ({
      comboId: c.id,
      comboName: c.snapshot.name,
      componentIds: c.snapshot.componentIds,
      listPriceCents: c.snapshot.priceCents,
    }));
  }

  async price(lines: PricingLine[], day: DateKey): Promise<PricingResult & { offerIds: string[] }> {
    const [offersByService, combos] = await Promise.all([this.offersByService(), this.combos()]);
    const result = calculatePrices(lines, { day, offersByService, combos });
    const offerIds = new Set<string>();
    for (const line of lines) {
      const offer = line.kind === 'SERVICE' ? offersByService.get(line.refId) : undefined;
      if (offer?.appliesOn(day)) offerIds.add(offer.id);
    }
    return { ...result, offerIds: [...offerIds] };
  }
}
