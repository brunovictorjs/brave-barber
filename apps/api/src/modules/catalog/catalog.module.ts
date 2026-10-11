import { Module } from '@nestjs/common';
import { CatalogCommands } from './application/catalog.commands';
import { CatalogQueries } from './application/catalog.queries';
import { OfferCommands } from './application/offer.commands';
import { PricingService } from './application/pricing.service';
import { CategoryRepository, OfferRepository, ProductRepository, ServiceRepository } from './domain/repositories';
import {
  PrismaCategoryRepository,
  PrismaOfferRepository,
  PrismaProductRepository,
  PrismaServiceRepository,
} from './infrastructure/prisma-catalog.repositories';
import { AdminCatalogController, PublicCatalogController, StaffCatalogController } from './presentation/catalog.controller';

/** Catálogo: serviços, produtos, categorias, ofertas e preços. */
@Module({
  controllers: [PublicCatalogController, StaffCatalogController, AdminCatalogController],
  providers: [
    CatalogCommands,
    CatalogQueries,
    OfferCommands,
    PricingService,
    { provide: ServiceRepository, useClass: PrismaServiceRepository },
    { provide: ProductRepository, useClass: PrismaProductRepository },
    { provide: OfferRepository, useClass: PrismaOfferRepository },
    { provide: CategoryRepository, useClass: PrismaCategoryRepository },
  ],
  exports: [PricingService, CatalogQueries, ServiceRepository, ProductRepository, OfferRepository],
})
export class CatalogModule {}
