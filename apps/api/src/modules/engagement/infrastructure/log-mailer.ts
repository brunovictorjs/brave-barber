import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { Mailer, MailMessage } from '../application/mailer';

/**
 * Driver "log": registra o envio no console e na tabela EmailLog (aparece em
 * "Últimos envios" nas configurações), sem mandar nada de verdade.
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
