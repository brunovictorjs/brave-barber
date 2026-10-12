export interface MailMessage {
  event: string;
  to: string[];
  subject: string;
  /** Linhas "rótulo: valor" do resumo do e-mail. */
  lines: [string, string][];
  cta?: { label: string; url: string };
}

/**
 * Porta de envio de e-mail. Os adaptadores ficam em `infrastructure/`:
 * `LogMailer` (desenvolvimento) e `ResendMailer` (envio real), escolhidos por
 * MAIL_DRIVER. Um envio que falha nunca derruba o fluxo do pedido: o adaptador
 * registra a falha em EmailLog e segue.
 */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}
