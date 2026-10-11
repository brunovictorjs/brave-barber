import type { Offer } from './offer';
import type { Product } from './product';
import type { Service } from './service';

/** Portas de persistência do catálogo (implementadas com Prisma na infraestrutura). */
export abstract class ServiceRepository {
  abstract findById(id: string): Promise<Service | null>;
  abstract findByIds(ids: string[]): Promise<Service[]>;
  abstract slugExists(slug: string, exceptId?: string): Promise<boolean>;
  abstract save(service: Service): Promise<void>;
  /** Combos ativos com seus componentes, para o cálculo de preço. */
  abstract activeCombos(): Promise<Service[]>;
}

export abstract class ProductRepository {
  abstract findById(id: string): Promise<Product | null>;
  abstract findByIds(ids: string[]): Promise<Product[]>;
  abstract slugExists(slug: string, exceptId?: string): Promise<boolean>;
  abstract save(product: Product): Promise<void>;
}

export abstract class OfferRepository {
  abstract findById(id: string): Promise<Offer | null>;
  /** Ofertas que ainda não terminaram (inclui as que começam no futuro). */
  abstract findOpen(): Promise<Offer[]>;
  abstract save(offer: Offer): Promise<void>;
  abstract incrementUsage(offerIds: string[]): Promise<void>;
}

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  kind: 'SERVICE' | 'PRODUCT';
  icon: string;
  position: number;
}

export abstract class CategoryRepository {
  abstract findById(id: string): Promise<CategoryRecord | null>;
  abstract list(kind?: 'SERVICE' | 'PRODUCT'): Promise<CategoryRecord[]>;
  abstract slugExists(slug: string, exceptId?: string): Promise<boolean>;
  abstract save(category: CategoryRecord): Promise<void>;
  abstract delete(id: string): Promise<void>;
  abstract countUsage(id: string): Promise<number>;
  /** Grava a posição de cada categoria na ordem da lista. */
  abstract reorder(ids: string[]): Promise<void>;
}
