import { Injectable } from '@nestjs/common';
import { DomainError, invariant } from '@/shared/domain/domain-error';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { CatalogQueries } from '@/modules/catalog/application/catalog.queries';

/** Favoritos do cliente: serviços, produtos e profissionais. */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogQueries,
  ) {}

  async list(userId: string) {
    const favorites = await this.prisma.favorite.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    const serviceIds = favorites.map((f) => f.serviceId).filter((v): v is string => !!v);
    const barberIds = favorites.map((f) => f.barberId).filter((v): v is string => !!v);
    const productIds = favorites.map((f) => f.productId).filter((v): v is string => !!v);
    const [services, barbers, products] = await Promise.all([
      serviceIds.length ? this.catalog.publicServices(userId) : Promise.resolve([]),
      barberIds.length ? this.catalog.barbersByIds(barberIds) : Promise.resolve([]),
      productIds.length ? this.catalog.publicProducts({}, userId) : Promise.resolve([]),
    ]);
    return {
      services: serviceIds.map((id) => services.find((s) => s.id === id)).filter(Boolean),
      products: productIds.map((id) => products.find((p) => p.id === id)).filter(Boolean),
      barbers: barberIds.map((id) => barbers.find((b) => b.id === id)).filter(Boolean),
    };
  }

  async addService(userId: string, serviceId: string) {
    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!service || service.status !== 'ACTIVE') throw DomainError.notFound('Serviço');
    invariant(service.acceptsFavorites, 'no_favorites', 'Este serviço não pode ser favoritado.');
    await this.prisma.favorite.upsert({ where: { userId_serviceId: { userId, serviceId } }, create: { userId, serviceId }, update: {} });
  }

  async removeService(userId: string, serviceId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, serviceId } });
  }

  async addProduct(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.sellOnline) throw DomainError.notFound('Produto');
    await this.prisma.favorite.upsert({ where: { userId_productId: { userId, productId } }, create: { userId, productId }, update: {} });
  }

  async removeProduct(userId: string, productId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, productId } });
  }

  async addBarber(userId: string, barberId: string) {
    const barber = await this.prisma.user.findFirst({ where: { id: barberId, roles: { contains: 'BARBER' }, active: true } });
    if (!barber) throw DomainError.notFound('Profissional');
    await this.prisma.favorite.upsert({ where: { userId_barberId: { userId, barberId } }, create: { userId, barberId }, update: {} });
  }

  async removeBarber(userId: string, barberId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, barberId } });
  }

  async isFavoriteBarber(userId: string | undefined, barberId: string) {
    if (!userId) return false;
    return (await this.prisma.favorite.count({ where: { userId, barberId } })) > 0;
  }
}
