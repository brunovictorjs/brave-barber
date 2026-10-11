import { AggregateRoot } from '@/shared/domain/aggregate-root';
import { invariant } from '@/shared/domain/domain-error';

export const SERVICE_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export interface ServiceMedia {
  id?: string;
  url: string;
  kind: 'IMAGE' | 'VIDEO';
}

export interface ServiceProps {
  slug: string;
  name: string;
  categoryId: string;
  priceCents: number;
  durationMin: number;
  summary: string;
  description: string;
  icon: string;
  status: ServiceStatus;
  isNew: boolean;
  acceptsFavorites: boolean;
  barberIds: string[];
  componentIds: string[];
  media: ServiceMedia[];
  createdAt: Date;
}

export type ServiceDetails = Pick<
  ServiceProps,
  'name' | 'categoryId' | 'priceCents' | 'durationMin' | 'summary' | 'description' | 'icon' | 'isNew' | 'acceptsFavorites'
>;

/** Serviço vendido com hora marcada. Tem preço, duração e quem pode executar. */
export class Service extends AggregateRoot {
  private constructor(
    id: string,
    private props: ServiceProps,
  ) {
    super(id);
  }

  static create(id: string, slug: string, details: ServiceDetails, now: Date): Service {
    Service.validate(details);
    return new Service(id, {
      ...details,
      slug,
      status: 'DRAFT',
      barberIds: [],
      componentIds: [],
      media: [],
      createdAt: now,
    });
  }

  static restore(id: string, props: ServiceProps): Service {
    return new Service(id, props);
  }

  private static validate(d: ServiceDetails): void {
    invariant(d.name.trim().length >= 2, 'invalid_name', 'Dê um nome ao serviço.');
    invariant(Number.isInteger(d.priceCents) && d.priceCents > 0, 'invalid_price', 'O preço precisa ser maior que zero.');
    invariant(
      Number.isInteger(d.durationMin) && d.durationMin >= 5 && d.durationMin <= 600 && d.durationMin % 5 === 0,
      'invalid_duration',
      'A duração vai de 5 minutos a 10 horas, em passos de 5 minutos.',
    );
  }

  update(details: ServiceDetails): void {
    Service.validate(details);
    this.props = { ...this.props, ...details };
  }

  publish(): void {
    invariant(this.props.barberIds.length > 0, 'no_barbers', 'Marque ao menos um profissional que executa este serviço antes de publicar.');
    this.props.status = 'ACTIVE';
  }

  unpublish(): void {
    this.props.status = 'DRAFT';
  }

  archive(): void {
    this.props.status = 'ARCHIVED';
  }

  assignBarbers(barberIds: string[]): void {
    const unique = Array.from(new Set(barberIds));
    if (this.props.status === 'ACTIVE') {
      invariant(unique.length > 0, 'no_barbers', 'Um serviço publicado precisa de ao menos um profissional.');
    }
    this.props.barberIds = unique;
  }

  /** Só combos têm componentes; um combo não pode conter a si mesmo. */
  setComponents(componentIds: string[], isComboCategory: boolean): void {
    const unique = Array.from(new Set(componentIds)).filter((id) => id !== this.id);
    invariant(isComboCategory || unique.length === 0, 'not_combo', 'Só serviços da categoria Combos têm serviços incluídos.');
    invariant(unique.length === 0 || unique.length >= 2, 'combo_size', 'Um combo junta pelo menos dois serviços.');
    this.props.componentIds = unique;
  }

  setMedia(media: ServiceMedia[]): void {
    invariant(media.length <= 12, 'too_many_media', 'Use até 12 fotos e vídeos por serviço.');
    this.props.media = media;
  }

  get snapshot(): Readonly<ServiceProps> {
    return this.props;
  }
}
