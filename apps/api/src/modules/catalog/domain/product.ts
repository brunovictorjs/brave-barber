import { AggregateRoot } from '@/shared/domain/aggregate-root';
import { invariant } from '@/shared/domain/domain-error';

export interface ProductProps {
  slug: string;
  name: string;
  categoryId: string;
  priceCents: number;
  detail: string;
  description: string;
  icon: string;
  highlight: string | null;
  available: boolean;
  sellOnline: boolean;
  barbersCanSell: boolean;
  mediaUrls: string[];
  createdAt: Date;
}

export type ProductDetails = Omit<ProductProps, 'slug' | 'mediaUrls' | 'createdAt'>;

/**
 * Produto de revenda (pomada, óleo…). Não tem duração nem estoque: quando
 * acaba, a casa desliga "Disponível".
 */
export class Product extends AggregateRoot {
  private constructor(
    id: string,
    private props: ProductProps,
  ) {
    super(id);
  }

  static create(id: string, slug: string, details: ProductDetails, now: Date): Product {
    Product.validate(details);
    return new Product(id, { ...details, slug, mediaUrls: [], createdAt: now });
  }

  static restore(id: string, props: ProductProps): Product {
    return new Product(id, props);
  }

  private static validate(d: ProductDetails): void {
    invariant(d.name.trim().length >= 2, 'invalid_name', 'Dê um nome ao produto.');
    invariant(Number.isInteger(d.priceCents) && d.priceCents > 0, 'invalid_price', 'O preço precisa ser maior que zero.');
  }

  update(details: ProductDetails): void {
    Product.validate(details);
    this.props = { ...this.props, ...details };
  }

  setMedia(urls: string[]): void {
    invariant(urls.length <= 8, 'too_many_media', 'Use até 8 fotos por produto.');
    this.props.mediaUrls = urls;
  }

  /** Pode ser comprado pelo cliente no site agora? */
  get purchasableOnline(): boolean {
    return this.props.available && this.props.sellOnline;
  }

  /** Pode ser lançado por um barbeiro no atendimento ou no pedido avulso? */
  get sellableByBarber(): boolean {
    return this.props.available && this.props.barbersCanSell;
  }

  get snapshot(): Readonly<ProductProps> {
    return this.props;
  }
}
