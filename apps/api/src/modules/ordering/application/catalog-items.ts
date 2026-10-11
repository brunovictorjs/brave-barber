import { Injectable } from '@nestjs/common';
import { DomainError } from '@/shared/domain/domain-error';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import type { CatalogItemSnapshot } from '../domain/order';

export type SaleChannel = 'SITE' | 'STAFF';

/**
 * Camada anticorrupção: traduz serviços e produtos do catálogo para o que o
 * pedido precisa guardar (nome, preço, duração, categoria) e aplica as regras
 * de venda do canal — no site, produto precisa estar à venda online; com o
 * barbeiro, precisa permitir lançamento pelos barbeiros.
 */
@Injectable()
export class CatalogItems {
  constructor(private readonly prisma: PrismaService) {}

  async services(ids: string[]): Promise<CatalogItemSnapshot[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.service.findMany({ where: { id: { in: ids } }, include: { category: true } });
    return ids.map((id) => {
      const s = rows.find((r) => r.id === id);
      if (!s || s.status !== 'ACTIVE') throw new DomainError('service_unavailable', 'Um dos serviços escolhidos não está mais disponível.');
      return {
        kind: 'SERVICE',
        refId: s.id,
        name: s.name,
        categoryId: s.categoryId,
        categoryName: s.category.name,
        icon: s.icon,
        listPriceCents: s.priceCents,
        durationMin: s.durationMin,
      };
    });
  }

  async products(ids: string[], channel: SaleChannel): Promise<CatalogItemSnapshot[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } }, include: { category: true } });
    return ids.map((id) => {
      const p = rows.find((r) => r.id === id);
      if (!p || !p.available) throw new DomainError('product_unavailable', `${p?.name ?? 'Um dos produtos'} está indisponível no momento.`);
      if (channel === 'SITE' && !p.sellOnline) throw new DomainError('product_not_online', `${p.name} só é vendido na barbearia.`);
      if (channel === 'STAFF' && !p.barbersCanSell) throw new DomainError('product_not_for_staff', `${p.name} não pode ser lançado pelos barbeiros.`);
      return {
        kind: 'PRODUCT',
        refId: p.id,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: p.category.name,
        icon: p.icon,
        listPriceCents: p.priceCents,
        durationMin: 0,
      };
    });
  }
}
