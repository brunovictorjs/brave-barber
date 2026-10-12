import type { MailMessage } from '../application/mailer';

export interface MailBrand {
  tradeName: string;
  address: string;
  cityUf: string;
  phone: string;
  instagram: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * E-mail transacional no visual da marca (preto e cromado), em tabelas e
 * estilos inline para funcionar no Gmail, Outlook e apps de celular.
 */
export function renderEmail(message: MailMessage, brand: MailBrand): { html: string; text: string } {
  const rows = message.lines
    .map(
      ([k, v]) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;color:#a3a3a3;font-size:13px;">${esc(k)}</td>
            <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;color:#f2f2f2;font-size:13px;font-weight:700;text-align:right;">${esc(v)}</td>
          </tr>`,
    )
    .join('');
  const cta = message.cta
    ? `
        <tr><td style="padding:8px 28px 4px;">
          <a href="${esc(message.cta.url)}" style="display:block;background:#f2f2f2;color:#0a0a0a;text-decoration:none;text-align:center;font-weight:800;font-size:13px;letter-spacing:.14em;text-transform:uppercase;padding:14px 18px;border-radius:4px;">${esc(message.cta.label)}</a>
        </td></tr>`
    : '';
  const footer = [brand.address && `${brand.address}${brand.cityUf ? ` · ${brand.cityUf}` : ''}`, [brand.phone, brand.instagram].filter(Boolean).join(' · ')]
    .filter(Boolean)
    .map((l) => esc(l as string))
    .join('<br>');

  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${esc(message.subject)}</title></head>
<body style="margin:0;padding:0;background:#050505;font-family:Montserrat,Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050505;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0e0e0e;border:1px solid #232323;border-radius:8px;">
        <tr><td style="padding:26px 28px 6px;">
          <div style="color:#d4d4d4;font-size:12px;font-weight:800;letter-spacing:.32em;text-transform:uppercase;">${esc(brand.tradeName)}</div>
        </td></tr>
        <tr><td style="padding:10px 28px 18px;">
          <h1 style="margin:0;color:#f2f2f2;font-size:21px;line-height:1.25;font-weight:800;text-transform:uppercase;">${esc(message.subject)}</h1>
        </td></tr>
        ${rows ? `<tr><td style="padding:0 28px 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>` : ''}
        ${cta}
        <tr><td style="padding:22px 28px 26px;color:#7a7a7a;font-size:11.5px;line-height:1.6;">
          ${footer}
          <div style="margin-top:10px;color:#5a5a5a;">Estilo • Respeito • Confiança</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    brand.tradeName.toUpperCase(),
    '',
    message.subject,
    '',
    ...message.lines.map(([k, v]) => `${k}: ${v}`),
    ...(message.cta ? ['', `${message.cta.label}: ${message.cta.url}`] : []),
    '',
    [brand.address, brand.cityUf].filter(Boolean).join(' · '),
  ].join('\n');

  return { html, text };
}
