import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { Actor, CurrentUser, Public, Roles } from '@/shared/presentation/auth';
import { ZodPipe } from '@/shared/presentation/zod';
import { FileStorage, UploadedFile as StoredFile } from '@/shared/infrastructure/storage/storage';
import { DomainError } from '@/shared/domain/domain-error';
import {
  CatalogCommands,
  CategoryInput,
  categoryInput,
  ProductInput,
  productInput,
  ServiceInput,
  serviceInput,
} from '../application/catalog.commands';
import { CatalogQueries } from '../application/catalog.queries';
import { OfferCommands, OfferInput, offerInput } from '../application/offer.commands';

const listQuery = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
  sort: z.enum(['popular', 'price', 'new']).optional(),
});

@Controller('catalog')
export class PublicCatalogController {
  constructor(private readonly queries: CatalogQueries) {}

  @Public()
  @Get('services')
  services(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>, @CurrentUser() actor?: Actor) {
    return this.queries.publicServices(actor?.id, q);
  }

  @Public()
  @Get('services/:slug')
  service(@Param('slug') slug: string, @CurrentUser() actor?: Actor) {
    return this.queries.serviceDetail(slug, actor?.id);
  }

  @Public()
  @Get('services/:slug/reviews')
  serviceReviews(@Param('slug') slug: string, @Query('page') page = '1') {
    return this.queries.serviceReviewsBySlug(slug, Math.max(1, Number(page) || 1));
  }

  @Public()
  @Get('products')
  products(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>, @CurrentUser() actor?: Actor) {
    return this.queries.publicProducts(q, actor?.id);
  }

  @Public()
  @Get('products/:slug')
  product(@Param('slug') slug: string, @CurrentUser() actor?: Actor) {
    return this.queries.productDetail(slug, actor?.id);
  }

  @Public()
  @Get('products/:slug/reviews')
  productReviews(@Param('slug') slug: string, @Query('page') page = '1') {
    return this.queries.productReviewsBySlug(slug, Math.max(1, Number(page) || 1));
  }

  @Public()
  @Get('categories')
  categories(@Query('kind') kind?: 'SERVICE' | 'PRODUCT') {
    return this.queries.categories(kind === 'SERVICE' || kind === 'PRODUCT' ? kind : undefined);
  }

  @Public()
  @Get('barbers')
  barbers() {
    return this.queries.barbersByIds();
  }
}

@Controller('staff/catalog')
@Roles('BARBER', 'RECEPTIONIST')
export class StaffCatalogController {
  constructor(private readonly queries: CatalogQueries) {}

  @Get()
  sellable() {
    return this.queries.staffSellable();
  }
}

const adminServicesQuery = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  inOffer: z.enum(['yes', 'no']).optional(),
});

const adminProductsQuery = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  available: z.enum(['yes', 'no']).optional(),
});

/** Catálogo no painel: administrador e balconista cadastram serviços, produtos e ofertas. */
@Controller('admin')
@Roles('RECEPTIONIST')
export class AdminCatalogController {
  constructor(
    private readonly queries: CatalogQueries,
    private readonly commands: CatalogCommands,
    private readonly offers: OfferCommands,
    private readonly storage: FileStorage,
  ) {}

  // Serviços
  @Get('services')
  services(@Query(new ZodPipe(adminServicesQuery)) q: z.infer<typeof adminServicesQuery>) {
    return this.queries.adminServices(q);
  }

  @Get('services/:id')
  service(@Param('id') id: string) {
    return this.queries.adminService(id);
  }

  @Post('services')
  createService(@Body(new ZodPipe(serviceInput)) body: ServiceInput) {
    return this.commands.createService(body);
  }

  @Put('services/:id')
  updateService(@Param('id') id: string, @Body(new ZodPipe(serviceInput)) body: ServiceInput) {
    return this.commands.updateService(id, body);
  }

  @Patch('services/:id/status')
  async serviceStatus(
    @Param('id') id: string,
    @Body(new ZodPipe(z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']) }))) body: { status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' },
  ) {
    await this.commands.setServiceStatus(id, body.status);
    return { ok: true };
  }

  // Produtos
  @Get('products')
  products(@Query(new ZodPipe(adminProductsQuery)) q: z.infer<typeof adminProductsQuery>) {
    return this.queries.adminProducts(q);
  }

  @Get('products/:id')
  product(@Param('id') id: string) {
    return this.queries.adminProduct(id);
  }

  @Post('products')
  createProduct(@Body(new ZodPipe(productInput)) body: ProductInput) {
    return this.commands.createProduct(body);
  }

  @Put('products/:id')
  updateProduct(@Param('id') id: string, @Body(new ZodPipe(productInput)) body: ProductInput) {
    return this.commands.updateProduct(id, body);
  }

  @Patch('products/:id/availability')
  async productAvailability(@Param('id') id: string, @Body(new ZodPipe(z.object({ available: z.boolean() }))) body: { available: boolean }) {
    await this.commands.setProductAvailability(id, body.available);
    return { ok: true };
  }

  // Categorias
  @Get('categories')
  categories() {
    return this.queries.categories();
  }

  @Post('categories')
  createCategory(@Body(new ZodPipe(categoryInput)) body: CategoryInput) {
    return this.commands.createCategory(body);
  }

  @Put('categories/order')
  async reorderCategories(
    @Body(new ZodPipe(z.object({ kind: z.enum(['SERVICE', 'PRODUCT']), ids: z.array(z.string()).min(1) })))
    body: { kind: 'SERVICE' | 'PRODUCT'; ids: string[] },
  ) {
    await this.commands.reorderCategories(body.kind, body.ids);
    return { ok: true };
  }

  @Put('categories/:id')
  async updateCategory(@Param('id') id: string, @Body(new ZodPipe(categoryInput)) body: CategoryInput) {
    await this.commands.updateCategory(id, body);
    return { ok: true };
  }

  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    await this.commands.deleteCategory(id);
    return { ok: true };
  }

  // Ofertas
  @Get('offers')
  offersList() {
    return this.queries.adminOffers();
  }

  @Get('offers/availability')
  offerAvailability(@Query('except') except?: string) {
    return this.queries.offerAvailability(except);
  }

  @Get('offers/:id')
  offer(@Param('id') id: string) {
    return this.queries.adminOffer(id);
  }

  @Post('offers')
  createOffer(@Body(new ZodPipe(offerInput)) body: OfferInput) {
    return this.offers.create(body);
  }

  @Put('offers/:id')
  async updateOffer(@Param('id') id: string, @Body(new ZodPipe(offerInput)) body: OfferInput) {
    await this.offers.update(id, body);
    return { ok: true };
  }

  @Post('offers/:id/end')
  async endOffer(@Param('id') id: string) {
    await this.offers.end(id);
    return { ok: true };
  }

  // Fotos e vídeos
  @Post('media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: StoredFile | undefined, @Query('folder') folder = 'catalog') {
    if (!file) throw new DomainError('no_file', 'Escolha um arquivo para enviar.');
    const safeFolder = /^[a-z-]+$/.test(folder) ? folder : 'catalog';
    const url = await this.storage.save(safeFolder, file);
    return { url, kind: file.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE' };
  }
}
