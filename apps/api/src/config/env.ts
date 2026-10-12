import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  WEB_URL: z.string().default('http://localhost:3000'),
  BUSINESS_TIMEZONE: z.string().default('America/Recife'),

  DATABASE_PROVIDER: z.enum(['sqlite', 'postgresql']).default('sqlite'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  DIRECT_URL: z.string().optional(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET precisa ter pelo menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  DEV_LOGIN: bool,

  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),

  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  SUPABASE_STORAGE_BUCKET: z.string().default('media'),

  MAIL_DRIVER: z.enum(['log', 'resend']).default('log'),
  RESEND_API_KEY: z.string().optional().default(''),
  MAIL_FROM: z.string().default('Brave Barber <onboarding@resend.dev>'),
  MAIL_REPLY_TO: z.string().optional().default(''),
  MAIL_REDIRECT_TO: z.string().optional().default(''),
});

export type Env = z.infer<typeof schema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && env.DEV_LOGIN) {
    throw new Error('DEV_LOGIN não pode ficar ligado em produção.');
  }
  if (env.STORAGE_DRIVER === 'supabase' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('STORAGE_DRIVER=supabase exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (env.MAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) {
    throw new Error('MAIL_DRIVER=resend exige RESEND_API_KEY.');
  }
  // Fora de produção, os e-mails reais vão todos para um endereço de teste:
  // o seed tem endereços de clientes fictícios que podem existir de verdade.
  if (env.MAIL_DRIVER === 'resend' && env.NODE_ENV !== 'production' && !env.MAIL_REDIRECT_TO) {
    throw new Error('Em desenvolvimento, MAIL_DRIVER=resend exige MAIL_REDIRECT_TO (o e-mail que recebe todos os envios de teste).');
  }
  return env;
}
