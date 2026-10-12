import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '@/config/app-config.service';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { SettingsService } from '@/modules/business/application/settings.service';
import { Mailer, MailMessage } from '../application/mailer';
import { renderEmail } from './email-template';

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Envio real pelo Resend (https://resend.com), pela API HTTP.
 *
 * - Um e-mail por destinatário: ninguém vê o endereço dos outros e o EmailLog
 *   registra o resultado de cada um.
 * - MAIL_REDIRECT_TO (obrigatório fora de produção) desvia todos os envios para
 *   um endereço de teste; o assunto ganha o destinatário original.
 * - Falha no Resend não interrompe o pedido: fica como FAILED em EmailLog.
 */
@Injectable()
export class ResendMailer extends Mailer {
  private readonly logger = new Logger('Mailer');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    const recipients = [...new Set(message.to.filter(Boolean))];
    if (!recipients.length) return;
    const shop = await this.settings.get('shop');
    const { html, text } = renderEmail(message, shop);
    const redirect = this.config.get('MAIL_REDIRECT_TO');
    const replyTo = this.config.get('MAIL_REPLY_TO') || shop.publicEmail || undefined;

    for (const original of recipients) {
      const to = redirect || original;
      const subject = redirect ? `[teste → ${original}] ${message.subject}` : message.subject;
      let status = 'SENT';
      let error: string | null = null;
      try {
        const res = await fetch(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.config.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: this.config.get('MAIL_FROM'),
            to: [to],
            subject,
            html,
            text,
            ...(replyTo ? { reply_to: replyTo } : {}),
            tags: [{ name: 'event', value: message.event.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256) }],
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(`Resend ${res.status}: ${body.message ?? res.statusText}`);
        }
      } catch (e) {
        status = 'FAILED';
        error = (e as Error).message.slice(0, 500);
        this.logger.warn(`✉ falhou: ${message.subject} → ${to} · ${error}`);
      }
      if (status === 'SENT') this.logger.log(`✉ ${message.subject} → ${to}${redirect ? ` (era ${original})` : ''}`);
      await this.prisma.emailLog.create({
        data: { event: message.event, to: redirect ? `${original} → ${redirect}` : original, subject: message.subject, status, error },
      });
    }
  }
}
