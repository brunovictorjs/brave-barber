import { AggregateRoot } from '@/shared/domain/aggregate-root';
import { DateKey, weekdayOf } from '@/shared/domain/business-time';
import { invariant } from '@/shared/domain/domain-error';
import { Money } from '@/shared/domain/money';

export type DiscountType = 'PERCENT' | 'FIXED';

export interface OfferProps {
  name: string;
  discountType: DiscountType;
  /** PERCENT: pontos-base (2500 = 25%) · FIXED: centavos. */
  discountValue: number;
  usageLimit: number | null;
  usedCount: number;
  startsOn: DateKey;
  endsOn: DateKey;
  weekdays: number[];
  serviceIds: string[];
  endedAt: Date | null;
  createdAt: Date;
}

export type OfferTerms = Pick<OfferProps, 'name' | 'discountType' | 'discountValue' | 'usageLimit' | 'startsOn' | 'endsOn' | 'weekdays' | 'serviceIds'>;

/**
 * Oferta: desconto em um grupo de serviços, num período e em dias da semana.
 * Um serviço só pode estar em uma oferta ativa por vez.
 */
export class Offer extends AggregateRoot {
  private constructor(
    id: string,
    private props: OfferProps,
  ) {
    super(id);
  }

  static create(id: string, terms: OfferTerms, now: Date): Offer {
    Offer.validate(terms);
    return new Offer(id, { ...terms, weekdays: [...new Set(terms.weekdays)].sort(), usedCount: 0, endedAt: null, createdAt: now });
  }

  static restore(id: string, props: OfferProps): Offer {
    return new Offer(id, props);
  }

  private static validate(t: OfferTerms): void {
    invariant(t.name.trim().length >= 2, 'invalid_name', 'Dê um nome à oferta.');
    invariant(t.startsOn <= t.endsOn, 'invalid_range', 'A oferta precisa terminar depois de começar.');
    invariant(t.weekdays.length > 0, 'no_weekdays', 'Escolha ao menos um dia da semana.');
    invariant(t.serviceIds.length > 0, 'no_services', 'Escolha ao menos um serviço para a oferta.');
    if (t.discountType === 'PERCENT') {
      invariant(t.discountValue >= 100 && t.discountValue <= 9000, 'invalid_discount', 'O desconto percentual vai de 1% a 90%.');
    } else {
      invariant(t.discountValue > 0, 'invalid_discount', 'O desconto precisa ser maior que zero.');
    }
    invariant(t.usageLimit === null || t.usageLimit > 0, 'invalid_limit', 'O limite de usos precisa ser positivo.');
  }

  update(terms: OfferTerms): void {
    Offer.validate(terms);
    this.props = { ...this.props, ...terms };
  }

  end(now: Date): void {
    this.props.endedAt = now;
  }

  /** A oferta está valendo hoje (período, sem encerrar e com usos sobrando)? */
  isActiveOn(day: DateKey): boolean {
    const p = this.props;
    if (p.endedAt) return false;
    if (p.usageLimit !== null && p.usedCount >= p.usageLimit) return false;
    return day >= p.startsOn && day <= p.endsOn;
  }

  /** Vale para um atendimento nesse dia (inclui o dia da semana)? */
  appliesOn(day: DateKey): boolean {
    return this.isActiveOn(day) && this.props.weekdays.includes(weekdayOf(day));
  }

  /** Ainda não terminou (ativa ou agendada para começar). Bloqueia o serviço para outras ofertas. */
  isOpenOn(day: DateKey): boolean {
    return !this.props.endedAt && day <= this.props.endsOn;
  }

  priceFor(listPriceCents: number): number {
    const p = this.props;
    const discounted =
      p.discountType === 'PERCENT'
        ? listPriceCents - Money.applyRate(listPriceCents, p.discountValue)
        : listPriceCents - p.discountValue;
    return Math.max(0, discounted);
  }

  get snapshot(): Readonly<OfferProps> {
    return this.props;
  }
}
