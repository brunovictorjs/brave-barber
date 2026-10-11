import { AggregateRoot, DomainEvent } from '@/shared/domain/aggregate-root';
import { invariant } from '@/shared/domain/domain-error';

export interface ReviewProps {
  orderId: string;
  customerId: string;
  barberId: string | null;
  serviceId: string | null;
  serviceLabel: string;
  serviceRating: number;
  barberRating: number;
  text: string | null;
  showOnHome: boolean;
  reply: string | null;
  repliedById: string | null;
  repliedAt: Date | null;
  createdAt: Date;
}

/**
 * Avaliação de um atendimento concluído: nota do serviço e do profissional,
 * texto opcional. Vai para o carrossel da home quando tem tudo preenchido e
 * nota máxima nas duas — a casa pode tirar da vitrine sem apagar.
 */
export class Review extends AggregateRoot {
  private constructor(
    id: string,
    private props: ReviewProps,
  ) {
    super(id);
  }

  static create(id: string, input: Omit<ReviewProps, 'showOnHome' | 'reply' | 'repliedById' | 'repliedAt'>): Review {
    invariant(Number.isInteger(input.serviceRating) && input.serviceRating >= 1 && input.serviceRating <= 5, 'invalid_rating', 'Dê uma nota de 1 a 5 para o serviço.');
    invariant(Number.isInteger(input.barberRating) && input.barberRating >= 1 && input.barberRating <= 5, 'invalid_rating', 'Dê uma nota de 1 a 5 para quem atendeu.');
    const text = input.text?.trim() || null;
    invariant(!text || text.length <= 1000, 'text_too_long', 'O texto vai até 1000 caracteres.');
    const review = new Review(id, { ...input, text, showOnHome: false, reply: null, repliedById: null, repliedAt: null });
    review.props.showOnHome = review.eligibleForHome;
    return review;
  }

  static restore(id: string, props: ReviewProps): Review {
    return new Review(id, props);
  }

  get eligibleForHome(): boolean {
    const p = this.props;
    return p.serviceRating === 5 && p.barberRating === 5 && !!p.text && !!p.serviceId;
  }

  setShowOnHome(show: boolean): void {
    invariant(!show || this.eligibleForHome, 'not_eligible', 'Só avaliações com as duas notas máximas, texto e serviço entram no carrossel.');
    this.props.showOnHome = show;
  }

  replyWith(text: string, staffId: string, now: Date): void {
    const reply = text.trim();
    invariant(reply.length >= 2 && reply.length <= 600, 'invalid_reply', 'A resposta vai de 2 a 600 caracteres.');
    this.props.reply = reply;
    this.props.repliedById = staffId;
    this.props.repliedAt = now;
  }

  get snapshot(): Readonly<ReviewProps> {
    return this.props;
  }
}

export class ReviewCreated implements DomainEvent {
  readonly name = 'review.created';
  readonly occurredAt = new Date();
  constructor(
    readonly reviewId: string,
    readonly orderId: string,
    readonly barberId: string | null,
    /** Menor das duas notas (para o alerta de qualidade). */
    readonly lowestRating: number,
  ) {}
}
