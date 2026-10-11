import { z } from 'zod';

/**
 * Configurações do negócio, uma seção por aba da tela de Configurações.
 * Cada seção tem schema (validação) e valor padrão (casa recém-instalada).
 */
const hm = z.string().regex(/^\d{2}:\d{2}$/, 'Use o formato HH:MM');

export const shopSettings = z.object({
  tradeName: z.string().min(1, 'Informe o nome fantasia'),
  legalName: z.string().default(''),
  cnpj: z.string().default(''),
  municipalRegistration: z.string().default(''),
  tagline: z.string().default(''),
  about: z.string().default(''),
  address: z.string().default(''),
  zip: z.string().default(''),
  district: z.string().default(''),
  cityUf: z.string().default(''),
  phone: z.string().default(''),
  publicEmail: z.string().default(''),
  instagram: z.string().default(''),
  // Vazio = logo e capa padrão do site (public/brand).
  logoUrl: z.string().default(''),
  coverUrl: z.string().default(''),
  // "latitude, longitude" do estabelecimento; só posiciona o mapa da landing.
  coordinates: z
    .string()
    .trim()
    .default('')
    .refine((v) => {
      if (!v) return true;
      const m = /^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(v);
      return !!m && Math.abs(Number(m[1])) <= 90 && Math.abs(Number(m[2])) <= 180;
    }, 'Use o formato latitude, longitude (ex.: -8.3394, -34.9547)'),
});

export const weekdayHours = z
  .object({
    weekday: z.number().int().min(0).max(6),
    open: hm.nullable(),
    close: hm.nullable(),
    breakStart: hm.nullable().default(null),
    breakEnd: hm.nullable().default(null),
    chairs: z.number().int().min(0).default(3),
  })
  .refine((d) => (d.open === null) === (d.close === null), 'Informe abertura e fechamento')
  .refine((d) => !d.open || !d.close || d.open < d.close, 'O fechamento precisa ser depois da abertura')
  .refine((d) => (d.breakStart === null) === (d.breakEnd === null), 'Informe início e fim do intervalo');

export const hoursSettings = z.object({
  weekly: z.array(weekdayHours).length(7),
});

export const schedulingSettings = z.object({
  slotIntervalMin: z.number().int().min(5).max(240),
  minAdvanceMin: z.number().int().min(0),
  horizonDays: z.number().int().min(1).max(365),
  bufferMin: z.number().int().min(0).max(120),
  /** Reembolso integral até X minutos depois do horário marcado (0 = até o horário). */
  refundCutoffMin: z.number().int().min(-1440).max(1440),
  /** Até quantos minutos de atraso o cliente ainda entra na fila de encaixe. */
  fitInMaxLateMin: z.number().int().min(0).max(600),
  pixHoldMin: z.number().int().min(1).max(60),
  cardHoldMin: z.number().int().min(1).max(60),
});

export const paymentSettings = z.object({
  methods: z.object({
    pix: z.boolean(),
    credit: z.boolean(),
    debit: z.boolean(),
    cash: z.boolean(),
    boleto: z.boolean(),
  }),
  maxInstallments: z.number().int().min(1).max(12),
  minInstallmentCents: z.number().int().min(0),
  cancellationFeeCents: z.number().int().min(0),
  autoRefund: z.boolean(),
  manualRefundOutsideWindow: z.boolean(),
  payoutSchedule: z.string().default('semanal, toda sexta'),
});

export const commissionRuleKeys = [
  'completed',
  'paidNotCompleted',
  'fitIn',
  'refunded',
  'barberProducts',
  'siteProducts',
] as const;

export const commissionSettings = z.object({
  defaultServiceBps: z.number().int().min(0).max(10_000),
  defaultProductBps: z.number().int().min(0).max(10_000),
  base: z.string(),
  closing: z.string(),
  payoutDay: z.string(),
  rules: z.object({
    completed: z.boolean(),
    paidNotCompleted: z.boolean(),
    fitIn: z.boolean(),
    refunded: z.boolean(),
    barberProducts: z.boolean(),
    siteProducts: z.boolean(),
  }),
});

export const NOTIFICATION_EVENTS = [
  'order_paid',
  'reminder',
  'customer_late',
  'fit_in',
  'service_started',
  'order_completed',
  'order_cancelled',
  'refund_completed',
  'review_received',
  'review_low',
  'daily_summary',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_CHANNELS = ['staffEmail', 'adminEmail', 'clientPush', 'clientEmail'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

const channelFlags = z.object({
  staffEmail: z.boolean(),
  adminEmail: z.boolean(),
  clientPush: z.boolean(),
  clientEmail: z.boolean(),
});

export const notificationSettings = z.object({
  matrix: z.object(
    Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e, channelFlags])) as Record<NotificationEvent, typeof channelFlags>,
  ),
  sender: z.object({ name: z.string(), email: z.string(), replyTo: z.string() }),
  reminders: z.object({
    firstHoursBefore: z.number().int().min(0),
    secondHoursBefore: z.number().int().min(0),
    barberMinutesBefore: z.number().int().min(0),
    dailySummaryAt: hm,
  }),
});

export const SETTINGS_SCHEMAS = {
  shop: shopSettings,
  hours: hoursSettings,
  scheduling: schedulingSettings,
  payment: paymentSettings,
  commission: commissionSettings,
  notifications: notificationSettings,
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type SettingsOf<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;
export type ShopSettings = SettingsOf<'shop'>;
export type HoursSettings = SettingsOf<'hours'>;
export type WeekdayHours = z.infer<typeof weekdayHours>;
export type SchedulingSettings = SettingsOf<'scheduling'>;
export type PaymentSettings = SettingsOf<'payment'>;
export type CommissionSettings = SettingsOf<'commission'>;
export type NotificationSettings = SettingsOf<'notifications'>;

const open = (weekday: number, close = '20:00', withBreak = true): WeekdayHours => ({
  weekday,
  open: '09:00',
  close,
  breakStart: withBreak ? '12:30' : null,
  breakEnd: withBreak ? '13:30' : null,
  chairs: 3,
});
const closed = (weekday: number): WeekdayHours => ({ weekday, open: null, close: null, breakStart: null, breakEnd: null, chairs: 0 });

const m = (staffEmail: number, adminEmail: number, clientPush: number, clientEmail: number) => ({
  staffEmail: !!staffEmail,
  adminEmail: !!adminEmail,
  clientPush: !!clientPush,
  clientEmail: !!clientEmail,
});

export const DEFAULT_SETTINGS: { [K in SettingsKey]: SettingsOf<K> } = {
  shop: {
    tradeName: 'Brave Barber',
    legalName: '',
    cnpj: '',
    municipalRegistration: '',
    tagline: 'Sua melhor versão, hora marcada',
    about: 'Três cadeiras em Gaibu desde 2019. Corte, barba e coloração com hora marcada e sem fila de espera. Estilo • Respeito • Confiança.',
    address: 'Av. Laura Cavalcante',
    zip: '',
    district: 'Gaibu',
    cityUf: 'Cabo de Santo Agostinho / PE',
    phone: '(81) 3 3344-8820',
    publicEmail: 'contato@bravebarber.com.br',
    instagram: '@bravebarber',
    logoUrl: '',
    coverUrl: '',
    coordinates: '-8.3394, -34.9547',
  },
  hours: {
    weekly: [closed(0), closed(1), open(2), open(3), open(4), open(5, '21:00'), open(6, '18:00', false)],
  },
  scheduling: {
    slotIntervalMin: 40,
    minAdvanceMin: 120,
    horizonDays: 60,
    bufferMin: 5,
    refundCutoffMin: 0,
    fitInMaxLateMin: 90,
    pixHoldMin: 10,
    cardHoldMin: 15,
  },
  payment: {
    methods: { pix: true, credit: true, debit: true, cash: true, boleto: false },
    maxInstallments: 3,
    minInstallmentCents: 2000,
    cancellationFeeCents: 0,
    autoRefund: true,
    manualRefundOutsideWindow: true,
    payoutSchedule: 'semanal, toda sexta',
  },
  commission: {
    defaultServiceBps: 5500,
    defaultProductBps: 1500,
    base: 'valor de venda, sem a taxa do Stripe',
    closing: 'semanal, de sábado a sexta',
    payoutDay: 'sexta-feira',
    rules: { completed: true, paidNotCompleted: false, fitIn: true, refunded: false, barberProducts: true, siteProducts: false },
  },
  notifications: {
    matrix: {
      order_paid: m(1, 1, 1, 1),
      reminder: m(1, 0, 1, 1),
      customer_late: m(1, 1, 1, 0),
      fit_in: m(1, 1, 1, 0),
      service_started: m(0, 0, 1, 0),
      order_completed: m(0, 1, 1, 1),
      order_cancelled: m(1, 1, 1, 1),
      refund_completed: m(0, 1, 1, 1),
      review_received: m(1, 1, 0, 0),
      review_low: m(0, 1, 0, 0),
      daily_summary: m(1, 1, 0, 0),
    },
    sender: { name: 'Brave Barber', email: 'avisos@bravebarber.com.br', replyTo: 'contato@bravebarber.com.br' },
    reminders: { firstHoursBefore: 24, secondHoursBefore: 2, barberMinutesBefore: 30, dailySummaryAt: '20:00' },
  },
};
