import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Actor } from '@/shared/presentation/auth';
import { DomainError } from '@/shared/domain/domain-error';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';

export const LEGAL_KINDS = ['PRIVACY', 'TERMS'] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

export const legalDraftInput = z.object({ content: z.string().min(20, 'O texto está curto demais') });

export interface LegalDocumentView {
  kind: LegalKind;
  /** Versão vigente (publicada) — o que clientes leem e aceitam. */
  published: { version: number; content: string; publishedAt: string } | null;
  /** Rascunho em edição, se houver. */
  draft: { version: number; content: string; editedByName: string | null; updatedAt: string } | null;
  acceptances: number;
  totalClients: number;
  history: { version: number; publishedAt: string | null; status: string }[];
}

/**
 * Política de privacidade e termos de serviço, versionados. Publicar uma
 * versão pede novo aceite no próximo login de cada cliente.
 */
@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  async view(kind: LegalKind): Promise<LegalDocumentView> {
    const docs = await this.prisma.legalDocument.findMany({ where: { kind }, orderBy: { version: 'desc' } });
    const published = docs.find((d) => d.status === 'PUBLISHED') ?? null;
    const draft = docs.find((d) => d.status === 'DRAFT') ?? null;
    const [acceptances, totalClients] = await Promise.all([
      published ? this.prisma.legalAcceptance.count({ where: { kind, version: published.version } }) : 0,
      this.prisma.user.count({ where: { roles: { contains: 'CLIENT' } } }),
    ]);
    return {
      kind,
      published: published
        ? { version: published.version, content: published.content, publishedAt: published.publishedAt!.toISOString() }
        : null,
      draft: draft
        ? { version: draft.version, content: draft.content, editedByName: draft.editedByName, updatedAt: draft.updatedAt.toISOString() }
        : null,
      acceptances,
      totalClients,
      history: docs.map((d) => ({ version: d.version, publishedAt: d.publishedAt?.toISOString() ?? null, status: d.status })),
    };
  }

  async saveDraft(kind: LegalKind, content: string, actor: Actor): Promise<LegalDocumentView> {
    const draft = await this.prisma.legalDocument.findFirst({ where: { kind, status: 'DRAFT' } });
    if (draft) {
      await this.prisma.legalDocument.update({
        where: { id: draft.id },
        data: { content, editedById: actor.id, editedByName: actor.name },
      });
    } else {
      const last = await this.prisma.legalDocument.findFirst({ where: { kind }, orderBy: { version: 'desc' } });
      await this.prisma.legalDocument.create({
        data: { kind, version: (last?.version ?? 0) + 1, content, status: 'DRAFT', editedById: actor.id, editedByName: actor.name },
      });
    }
    return this.view(kind);
  }

  async publish(kind: LegalKind, actor: Actor): Promise<LegalDocumentView> {
    const draft = await this.prisma.legalDocument.findFirst({ where: { kind, status: 'DRAFT' } });
    if (!draft) throw new DomainError('no_draft', 'Não há rascunho para publicar. Edite o texto primeiro.');
    await this.prisma.$transaction([
      this.prisma.legalDocument.updateMany({ where: { kind, status: 'PUBLISHED' }, data: { status: 'SUPERSEDED' } }),
      this.prisma.legalDocument.update({
        where: { id: draft.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), editedById: actor.id, editedByName: actor.name },
      }),
    ]);
    return this.view(kind);
  }

  async current(kind: LegalKind): Promise<{ version: number; content: string; publishedAt: string } | null> {
    const doc = await this.prisma.legalDocument.findFirst({ where: { kind, status: 'PUBLISHED' } });
    return doc ? { version: doc.version, content: doc.content, publishedAt: doc.publishedAt!.toISOString() } : null;
  }

  /** Versões publicadas que o usuário ainda não aceitou. */
  async pendingFor(userId: string): Promise<{ kind: LegalKind; version: number }[]> {
    const published = await this.prisma.legalDocument.findMany({ where: { status: 'PUBLISHED' } });
    const accepted = await this.prisma.legalAcceptance.findMany({ where: { userId } });
    return published
      .filter((doc) => !accepted.some((a) => a.kind === doc.kind && a.version === doc.version))
      .map((doc) => ({ kind: doc.kind as LegalKind, version: doc.version }));
  }

  async accept(userId: string): Promise<void> {
    const pending = await this.pendingFor(userId);
    for (const p of pending) {
      await this.prisma.legalAcceptance.upsert({
        where: { userId_kind_version: { userId, kind: p.kind, version: p.version } },
        create: { userId, kind: p.kind, version: p.version },
        update: {},
      });
    }
  }
}
