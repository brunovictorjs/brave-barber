import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { toDateKey } from '@/shared/domain/business-time';
import { DomainError } from '@/shared/domain/domain-error';
import { newId } from '@/shared/domain/text';
import { Clock } from '@/shared/infrastructure/clock';
import { Offer } from '../domain/offer';
import { OfferRepository, ServiceRepository } from '../domain/repositories';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use uma data válida');

export const offerInput = z.object({
  name: z.string().trim().min(2, 'Dê um nome à oferta'),
  discountType: z.enum(['PERCENT', 'FIXED']),
  discountValue: z.number().int().positive('Informe o desconto'),
  usageLimit: z.number().int().positive().nullable().default(null),
  startsOn: day,
  endsOn: day,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'Escolha ao menos um dia'),
  serviceIds: z.array(z.string()).min(1, 'Escolha ao menos um serviço'),
});
export type OfferInput = z.infer<typeof offerInput>;

@Injectable()
export class OfferCommands {
  constructor(
    private readonly offers: OfferRepository,
    private readonly services: ServiceRepository,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  /** Um serviço só pode estar em uma oferta que ainda não terminou. */
  private async ensureServicesFree(serviceIds: string[], exceptOfferId?: string): Promise<void> {
    const today = toDateKey(this.clock.now(), this.config.timeZone);
    const open = (await this.offers.findOpen()).filter((o) => o.id !== exceptOfferId && o.isOpenOn(today));
    const services = await this.services.findByIds(serviceIds);
    if (services.length !== serviceIds.length) throw new DomainError('invalid_services', 'Algum serviço escolhido não existe mais.');
    for (const service of services) {
      const taken = open.find((o) => o.snapshot.serviceIds.includes(service.id));
      if (taken) {
        throw DomainError.conflict(
          'service_in_offer',
          `${service.snapshot.name} já está na oferta "${taken.snapshot.name}". Encerre aquela oferta antes de reaproveitar o serviço.`,
        );
      }
    }
  }

  private async ensureFixedFits(input: OfferInput): Promise<void> {
    if (input.discountType !== 'FIXED') return;
    const services = await this.services.findByIds(input.serviceIds);
    const cheapest = services.reduce((min, s) => Math.min(min, s.snapshot.priceCents), Infinity);
    if (input.discountValue >= cheapest) {
      throw new DomainError('discount_too_high', 'O desconto fixo precisa ser menor que o preço de todos os serviços escolhidos.');
    }
  }

  async create(input: OfferInput): Promise<{ id: string }> {
    await this.ensureServicesFree(input.serviceIds);
    await this.ensureFixedFits(input);
    const offer = Offer.create(newId(), input, this.clock.now());
    await this.offers.save(offer);
    return { id: offer.id };
  }

  async update(id: string, input: OfferInput): Promise<void> {
    const offer = await this.offers.findById(id);
    if (!offer) throw DomainError.notFound('Oferta');
    await this.ensureServicesFree(input.serviceIds, id);
    await this.ensureFixedFits(input);
    offer.update(input);
    await this.offers.save(offer);
  }

  async end(id: string): Promise<void> {
    const offer = await this.offers.findById(id);
    if (!offer) throw DomainError.notFound('Oferta');
    offer.end(this.clock.now());
    await this.offers.save(offer);
  }
}
