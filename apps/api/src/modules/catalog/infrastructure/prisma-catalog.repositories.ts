import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppConfig } from '@/config/app-config.service';
import { toDateKey, zonedTime } from '@/shared/domain/business-time';
import { parseJson, toJson } from '@/shared/infrastructure/json';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { Offer } from '../domain/offer';
import { Product } from '../domain/product';
import {
  CategoryRecord,
  CategoryRepository,
  OfferRepository,
  ProductRepository,
  ServiceRepository,
} from '../domain/repositories';
import { Service, ServiceStatus } from '../domain/service';

const serviceInclude = {
  barbers: { select: { barberId: true } },
  components: { select: { componentId: true } },
  media: { orderBy: { position: 'asc' } },
} satisfies Prisma.ServiceInclude;

type ServiceRow = Prisma.ServiceGetPayload<{ include: typeof serviceInclude }>;

function toService(row: ServiceRow): Service {
  return Service.restore(row.id, {
    slug: row.slug,
    name: row.name,
    categoryId: row.categoryId,
    priceCents: row.priceCents,
    durationMin: row.durationMin,
    summary: row.summary,
    description: row.description,
    icon: row.icon,
    status: row.status as ServiceStatus,
    isNew: row.isNew,
    acceptsFavorites: row.acceptsFavorites,
    barberIds: row.barbers.map((b) => b.barberId),
    componentIds: row.components.map((c) => c.componentId),
    media: row.media.map((m) => ({ id: m.id, url: m.url, kind: m.kind as 'IMAGE' | 'VIDEO' })),
    createdAt: row.createdAt,
  });
}

@Injectable()
export class PrismaServiceRepository extends ServiceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<Service | null> {
    const row = await this.prisma.service.findUnique({ where: { id }, include: serviceInclude });
    return row ? toService(row) : null;
  }

  async findByIds(ids: string[]): Promise<Service[]> {
    const rows = await this.prisma.service.findMany({ where: { id: { in: ids } }, include: serviceInclude });
    return rows.map(toService);
  }

  async slugExists(slug: string, exceptId?: string): Promise<boolean> {
    const found = await this.prisma.service.findFirst({ where: { slug, NOT: exceptId ? { id: exceptId } : undefined } });
    return !!found;
  }

  async activeCombos(): Promise<Service[]> {
    const rows = await this.prisma.service.findMany({
      where: { status: 'ACTIVE', components: { some: {} } },
      include: serviceInclude,
    });
    return rows.map(toService);
  }

  async save(service: Service): Promise<void> {
    const s = service.snapshot;
    const data = {
      slug: s.slug,
      name: s.name,
      categoryId: s.categoryId,
      priceCents: s.priceCents,
      durationMin: s.durationMin,
      summary: s.summary,
      description: s.description,
      icon: s.icon,
      status: s.status,
      isNew: s.isNew,
      acceptsFavorites: s.acceptsFavorites,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.service.upsert({ where: { id: service.id }, create: { id: service.id, createdAt: s.createdAt, ...data }, update: data });
      await tx.serviceBarber.deleteMany({ where: { serviceId: service.id } });
      if (s.barberIds.length) {
        await tx.serviceBarber.createMany({ data: s.barberIds.map((barberId) => ({ serviceId: service.id, barberId })) });
      }
      await tx.serviceComponent.deleteMany({ where: { comboId: service.id } });
      if (s.componentIds.length) {
        await tx.serviceComponent.createMany({ data: s.componentIds.map((componentId) => ({ comboId: service.id, componentId })) });
      }
      await tx.serviceMedia.deleteMany({ where: { serviceId: service.id } });
      if (s.media.length) {
        await tx.serviceMedia.createMany({
          data: s.media.map((m, position) => ({ serviceId: service.id, url: m.url, kind: m.kind, position })),
        });
      }
    });
  }
}

const productInclude = { media: { orderBy: { position: 'asc' } } } satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function toProduct(row: ProductRow): Product {
  return Product.restore(row.id, {
    slug: row.slug,
    name: row.name,
    categoryId: row.categoryId,
    priceCents: row.priceCents,
    detail: row.detail,
    description: row.description,
    icon: row.icon,
    highlight: row.highlight,
    available: row.available,
    sellOnline: row.sellOnline,
    barbersCanSell: row.barbersCanSell,
    mediaUrls: row.media.map((m) => m.url),
    createdAt: row.createdAt,
  });
}

@Injectable()
export class PrismaProductRepository extends ProductRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    return row ? toProduct(row) : null;
  }

  async findByIds(ids: string[]): Promise<Product[]> {
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } }, include: productInclude });
    return rows.map(toProduct);
  }

  async slugExists(slug: string, exceptId?: string): Promise<boolean> {
    const found = await this.prisma.product.findFirst({ where: { slug, NOT: exceptId ? { id: exceptId } : undefined } });
    return !!found;
  }

  async save(product: Product): Promise<void> {
    const p = product.snapshot;
    const data = {
      slug: p.slug,
      name: p.name,
      categoryId: p.categoryId,
      priceCents: p.priceCents,
      detail: p.detail,
      description: p.description,
      icon: p.icon,
      highlight: p.highlight,
      available: p.available,
      sellOnline: p.sellOnline,
      barbersCanSell: p.barbersCanSell,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.product.upsert({ where: { id: product.id }, create: { id: product.id, createdAt: p.createdAt, ...data }, update: data });
      await tx.productMedia.deleteMany({ where: { productId: product.id } });
      if (p.mediaUrls.length) {
        await tx.productMedia.createMany({ data: p.mediaUrls.map((url, position) => ({ productId: product.id, url, position })) });
      }
    });
  }
}

const offerInclude = { services: { select: { serviceId: true } } } satisfies Prisma.OfferInclude;
type OfferRow = Prisma.OfferGetPayload<{ include: typeof offerInclude }>;

@Injectable()
export class PrismaOfferRepository extends OfferRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {
    super();
  }

  private toOffer(row: OfferRow): Offer {
    const tz = this.config.timeZone;
    return Offer.restore(row.id, {
      name: row.name,
      discountType: row.discountType as 'PERCENT' | 'FIXED',
      discountValue: row.discountValue,
      usageLimit: row.usageLimit,
      usedCount: row.usedCount,
      startsOn: toDateKey(row.startsOn, tz),
      endsOn: toDateKey(row.endsOn, tz),
      weekdays: parseJson<number[]>(row.weekdays, [0, 1, 2, 3, 4, 5, 6]),
      serviceIds: row.services.map((s) => s.serviceId),
      endedAt: row.endedAt,
      createdAt: row.createdAt,
    });
  }

  async findById(id: string): Promise<Offer | null> {
    const row = await this.prisma.offer.findUnique({ where: { id }, include: offerInclude });
    return row ? this.toOffer(row) : null;
  }

  async findOpen(): Promise<Offer[]> {
    const yesterday = new Date(Date.now() - 36 * 3600_000);
    const rows = await this.prisma.offer.findMany({
      where: { endedAt: null, endsOn: { gte: yesterday } },
      include: offerInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toOffer(r));
  }

  async save(offer: Offer): Promise<void> {
    const o = offer.snapshot;
    const tz = this.config.timeZone;
    const data = {
      name: o.name,
      discountType: o.discountType,
      discountValue: o.discountValue,
      usageLimit: o.usageLimit,
      usedCount: o.usedCount,
      startsOn: zonedTime(o.startsOn, 0, tz),
      endsOn: zonedTime(o.endsOn, 0, tz),
      weekdays: toJson(o.weekdays),
      endedAt: o.endedAt,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.offer.upsert({ where: { id: offer.id }, create: { id: offer.id, createdAt: o.createdAt, ...data }, update: data });
      await tx.offerService.deleteMany({ where: { offerId: offer.id } });
      await tx.offerService.createMany({ data: o.serviceIds.map((serviceId) => ({ offerId: offer.id, serviceId })) });
    });
  }

  async incrementUsage(offerIds: string[]): Promise<void> {
    if (!offerIds.length) return;
    await this.prisma.offer.updateMany({ where: { id: { in: offerIds } }, data: { usedCount: { increment: 1 } } });
  }
}

@Injectable()
export class PrismaCategoryRepository extends CategoryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private map(row: { id: string; name: string; slug: string; kind: string; icon: string; position: number }): CategoryRecord {
    return { ...row, kind: row.kind as CategoryRecord['kind'] };
  }

  async findById(id: string): Promise<CategoryRecord | null> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    return row ? this.map(row) : null;
  }

  async reorder(ids: string[]): Promise<void> {
    await this.prisma.$transaction(ids.map((id, position) => this.prisma.category.update({ where: { id }, data: { position } })));
  }

  async list(kind?: 'SERVICE' | 'PRODUCT'): Promise<CategoryRecord[]> {
    const rows = await this.prisma.category.findMany({ where: kind ? { kind } : undefined, orderBy: [{ kind: 'asc' }, { position: 'asc' }] });
    return rows.map((r) => this.map(r));
  }

  async slugExists(slug: string, exceptId?: string): Promise<boolean> {
    const found = await this.prisma.category.findFirst({ where: { slug, NOT: exceptId ? { id: exceptId } : undefined } });
    return !!found;
  }

  async save(c: CategoryRecord): Promise<void> {
    const data = { name: c.name, slug: c.slug, kind: c.kind, icon: c.icon, position: c.position };
    await this.prisma.category.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }

  async countUsage(id: string): Promise<number> {
    const [services, products] = await Promise.all([
      this.prisma.service.count({ where: { categoryId: id } }),
      this.prisma.product.count({ where: { categoryId: id } }),
    ]);
    return services + products;
  }
}
