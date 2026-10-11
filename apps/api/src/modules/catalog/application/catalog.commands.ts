import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Clock } from '@/shared/infrastructure/clock';
import { DomainError, invariant } from '@/shared/domain/domain-error';
import { newId, slugify } from '@/shared/domain/text';
import { Product } from '../domain/product';
import { CategoryRepository, ProductRepository, ServiceRepository } from '../domain/repositories';
import { Service } from '../domain/service';

const icon = z.string().regex(/^[a-z]+$/).default('scissor');

export const serviceInput = z.object({
  name: z.string().trim().min(2, 'Dê um nome ao serviço'),
  categoryId: z.string().min(1, 'Escolha a categoria'),
  priceCents: z.number().int().positive('Informe o preço'),
  durationMin: z.number().int().positive('Informe a duração'),
  summary: z.string().max(160).default(''),
  description: z.string().max(20_000).default(''),
  icon,
  isNew: z.boolean().default(false),
  acceptsFavorites: z.boolean().default(true),
  barberIds: z.array(z.string()).default([]),
  componentIds: z.array(z.string()).default([]),
  media: z.array(z.object({ url: z.string().min(1), kind: z.enum(['IMAGE', 'VIDEO']) })).default([]),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});
export type ServiceInput = z.infer<typeof serviceInput>;

export const productInput = z.object({
  name: z.string().trim().min(2, 'Dê um nome ao produto'),
  categoryId: z.string().min(1, 'Escolha o tipo'),
  priceCents: z.number().int().positive('Informe o preço'),
  detail: z.string().max(120).default(''),
  description: z.string().max(20_000).default(''),
  icon: icon.default('bag'),
  highlight: z.string().max(30).nullable().default(null),
  available: z.boolean().default(true),
  sellOnline: z.boolean().default(true),
  barbersCanSell: z.boolean().default(true),
  mediaUrls: z.array(z.string()).default([]),
});
export type ProductInput = z.infer<typeof productInput>;

export const categoryInput = z.object({
  name: z.string().trim().min(2, 'Dê um nome à categoria'),
  kind: z.enum(['SERVICE', 'PRODUCT']),
  icon: icon,
});
export type CategoryInput = z.infer<typeof categoryInput>;

/** Casos de uso de escrita do catálogo: serviços, produtos e categorias. */
@Injectable()
export class CatalogCommands {
  constructor(
    private readonly services: ServiceRepository,
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly clock: Clock,
  ) {}

  private async uniqueSlug(name: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
    const base = slugify(name) || 'item';
    let slug = base;
    for (let i = 2; await exists(slug); i++) slug = `${base}-${i}`;
    return slug;
  }

  private async requireCategory(id: string, kind: 'SERVICE' | 'PRODUCT') {
    const category = await this.categories.findById(id);
    if (!category || category.kind !== kind) throw new DomainError('invalid_category', 'Escolha uma categoria válida.');
    return category;
  }

  private async applyServiceInput(service: Service, input: ServiceInput): Promise<void> {
    const category = await this.requireCategory(input.categoryId, 'SERVICE');
    service.update(input);
    if (input.componentIds.length) {
      const parts = await this.services.findByIds(input.componentIds);
      invariant(parts.length === input.componentIds.length, 'invalid_components', 'Algum serviço do combo não existe mais.');
    }
    service.setComponents(input.componentIds, category.slug === 'combos');
    service.assignBarbers(input.barberIds);
    service.setMedia(input.media);
    if (input.status === 'ACTIVE') service.publish();
    if (input.status === 'DRAFT') service.unpublish();
    if (input.status === 'ARCHIVED') service.archive();
  }

  async createService(input: ServiceInput): Promise<{ id: string; slug: string }> {
    const slug = await this.uniqueSlug(input.name, (s) => this.services.slugExists(s));
    const service = Service.create(newId(), slug, input, this.clock.now());
    await this.applyServiceInput(service, input);
    await this.services.save(service);
    return { id: service.id, slug };
  }

  async updateService(id: string, input: ServiceInput): Promise<{ id: string; slug: string }> {
    const service = await this.services.findById(id);
    if (!service) throw DomainError.notFound('Serviço');
    await this.applyServiceInput(service, input);
    await this.services.save(service);
    return { id, slug: service.snapshot.slug };
  }

  async setServiceStatus(id: string, status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'): Promise<void> {
    const service = await this.services.findById(id);
    if (!service) throw DomainError.notFound('Serviço');
    if (status === 'ACTIVE') service.publish();
    else if (status === 'DRAFT') service.unpublish();
    else service.archive();
    await this.services.save(service);
  }

  async createProduct(input: ProductInput): Promise<{ id: string; slug: string }> {
    await this.requireCategory(input.categoryId, 'PRODUCT');
    const slug = await this.uniqueSlug(input.name, (s) => this.products.slugExists(s));
    const product = Product.create(newId(), slug, input, this.clock.now());
    product.setMedia(input.mediaUrls);
    await this.products.save(product);
    return { id: product.id, slug };
  }

  async updateProduct(id: string, input: ProductInput): Promise<{ id: string; slug: string }> {
    const product = await this.products.findById(id);
    if (!product) throw DomainError.notFound('Produto');
    await this.requireCategory(input.categoryId, 'PRODUCT');
    product.update(input);
    product.setMedia(input.mediaUrls);
    await this.products.save(product);
    return { id, slug: product.snapshot.slug };
  }

  async setProductAvailability(id: string, available: boolean): Promise<void> {
    const product = await this.products.findById(id);
    if (!product) throw DomainError.notFound('Produto');
    product.update({ ...product.snapshot, available });
    await this.products.save(product);
  }

  async createCategory(input: CategoryInput): Promise<{ id: string }> {
    const slug = await this.uniqueSlug(input.name, (s) => this.categories.slugExists(s));
    const id = newId();
    // Nova categoria entra no fim da lista do seu tipo.
    const siblings = await this.categories.list(input.kind);
    await this.categories.save({ id, slug, position: Math.max(-1, ...siblings.map((c) => c.position)) + 1, ...input });
    return { id };
  }

  async updateCategory(id: string, input: CategoryInput): Promise<void> {
    const category = await this.categories.findById(id);
    if (!category) throw DomainError.notFound('Categoria');
    invariant(category.kind === input.kind || (await this.categories.countUsage(id)) === 0, 'category_in_use', 'Esta categoria já tem itens; não dá para trocar o tipo.');
    await this.categories.save({ ...category, ...input });
  }

  /** Nova ordem das categorias de um tipo, como o administrador arrastou. */
  async reorderCategories(kind: 'SERVICE' | 'PRODUCT', ids: string[]): Promise<void> {
    const rows = await this.categories.list(kind);
    invariant(rows.length === ids.length && rows.every((r) => ids.includes(r.id)), 'invalid_order', 'A lista de categorias mudou. Recarregue a página.');
    await this.categories.reorder(ids);
  }

  async deleteCategory(id: string): Promise<void> {
    const category = await this.categories.findById(id);
    if (!category) throw DomainError.notFound('Categoria');
    const usage = await this.categories.countUsage(id);
    if (usage > 0) {
      throw DomainError.conflict('category_in_use', `Esta categoria tem ${usage} ${usage === 1 ? 'item' : 'itens'}. Mova-os para outra antes de apagar.`);
    }
    await this.categories.delete(id);
  }
}
