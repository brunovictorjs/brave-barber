import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';

export interface MailMessage {
  event: string;
  to: string[];
  subject: string;
  /** Linhas "rótulo: valor" do resumo do e-mail. */
  lines: [string, string][];
  cta?: { label: string; url: string };
}

/** Porta de envio de e-mail. */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

/**
 * Driver "log": registra o envio no console e na tabela EmailLog (aparece em
 * "Últimos envios" nas configurações). Trocar por SMTP/Resend é só implementar
 * esta mesma porta.
 */
@Injectable()
export class LogMailer extends Mailer {
  private readonly logger = new Logger('Mailer');

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    const to = [...new Set(message.to.filter(Boolean))];
    if (!to.length) return;
    const body = message.lines.map(([k, v]) => `  ${k}: ${v}`).join('\n');
    this.logger.log(`✉ ${message.subject} → ${to.join(', ')}\n${body}`);
    await this.prisma.emailLog.createMany({
      data: to.map((address) => ({ event: message.event, to: address, subject: message.subject, status: 'SENT' })),
    });
  }
}
