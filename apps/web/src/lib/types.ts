/** Formatos das respostas da API (espelham as visões montadas no NestJS). */

export type Role = 'CLIENT' | 'BARBER' | 'RECEPTIONIST' | 'ADMIN';

export interface Avatar {
  initials: string;
  variant: 'a' | 'b' | 'c' | 'd' | 'e';
  url: string | null;
}

export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string | null;
  about: string | null;
  specialties: string[];
  avatar: Avatar;
  roles: Role[];
  onboarded: boolean;
  staff: { headline: string; chairLabel: string | null; sinceYear: number | null } | null;
  pendingLegal: { kind: 'PRIVACY' | 'TERMS'; version: number }[];
  stats: { completed: number; favorites: number; reviews: number };
  googleLinked: boolean;
}

export interface Rating {
  average: number | null;
  count: number;
}

export interface OfferBadge {
  id: string;
  name: string;
  label: string;
  endsOn: string;
  daysLeft: number;
  weekdays: number[];
  appliesToday: boolean;
}

export interface ServiceCard {
  id: string;
  slug: string;
  name: string;
  summary: string;
  icon: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  durationMin: number;
  listPriceCents: number;
  priceCents: number;
  offer: OfferBadge | null;
  isNew: boolean;
  rating: Rating;
  coverUrl: string | null;
  favorite: boolean;
  acceptsFavorites: boolean;
  sold: number;
  createdAt: string;
}

export interface BarberCard {
  id: string;
  name: string;
  firstName: string;
  headline: string;
  avatar: Avatar;
  rating: Rating;
}

export interface ServiceDetail extends ServiceCard {
  status: string;
  description: string;
  media: { url: string; kind: 'IMAGE' | 'VIDEO' }[];
  barbers: BarberCard[];
  components: { id: string; name: string }[];
  reviews: ReviewPage;
}

/** Uma página de avaliações públicas (serviço, produto ou profissional). */
export interface ReviewPage {
  items: { id: string; name: string; avatar: Avatar; rating: number; text: string; createdAt: string }[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  icon: string;
  categoryId: string;
  categoryName: string;
  detail: string;
  description: string;
  priceCents: number;
  highlight: string | null;
  available: boolean;
  sellOnline: boolean;
  barbersCanSell: boolean;
  coverUrl: string | null;
  mediaUrls: string[];
  favorite?: boolean;
  rating?: Rating;
}

export interface ProductDetail extends ProductCard {
  reviews: ReviewPage;
  related: ProductCard[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  kind: 'SERVICE' | 'PRODUCT';
  icon: string;
  position: number;
  count: number;
}

export interface ReviewView {
  id: string;
  orderCode: string;
  customer: { id: string; name: string; avatar: Avatar };
  barber: { id: string; name: string; firstName: string } | null;
  serviceLabel: string;
  serviceRating: number;
  barberRating: number;
  text: string | null;
  showOnHome: boolean;
  eligibleForHome: boolean;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  dateLabel: string;
}

export interface ShopSettings {
  tradeName: string;
  legalName: string;
  cnpj: string;
  municipalRegistration: string;
  tagline: string;
  about: string;
  address: string;
  zip: string;
  district: string;
  cityUf: string;
  phone: string;
  publicEmail: string;
  instagram: string;
  logoUrl: string;
  coverUrl: string;
  coordinates: string;
}

export interface StorefrontHome {
  shop: ShopSettings;
  status: { open: boolean; label: string };
  hours: { main: string; note: string };
  nextFree: { date: string; time: string } | null;
  rating: Rating;
  chairs: number;
  barbersCount: number;
  quick: { id: string; name: string; slug: string; icon: string; fromCents: number }[];
  news: { items: ServiceCard[]; since: string | null };
  offers: ServiceCard[];
  catalog: ServiceCard[];
  categories: Category[];
  team: BarberCard[];
  reviews: ReviewView[];
}

export interface BarberProfile {
  id: string;
  name: string;
  firstName: string;
  avatar: Avatar;
  headline: string;
  sinceYear: number | null;
  about: string | null;
  specialties: string[];
  rating: Rating;
  completed: number;
  services: { id: string; slug: string; name: string }[];
  reviews: ReviewPage;
  favorite: boolean;
}

export interface CartItem {
  id: string;
  kind: 'SERVICE' | 'PRODUCT';
  refId: string;
  name: string;
  icon: string;
  categoryName: string;
  durationMin: number;
  quantity: number;
  listPriceCents: number;
  unitPriceCents: number;
  discountCents: number;
  offerName: string | null;
}

export interface Cart {
  id: string | null;
  items: CartItem[];
  combos: { comboName: string; discountCents: number }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  durationMin: number;
  count: number;
  type: 'APPOINTMENT' | 'PICKUP' | null;
  schedule: {
    date: string;
    time: string;
    endTime: string;
    start: string;
    anyBarber: boolean;
    barber: { id: string; name: string; firstName: string; headline: string; avatar: Avatar } | null;
  } | null;
  suggestion: { id: string; name: string; priceCents: number; icon: string; detail: string } | null;
}

export type DayStatus = 'available' | 'full' | 'closed' | 'past' | 'beyond';

export interface CalendarView {
  month: string;
  durationMin: number;
  today: string;
  days: { date: string; weekday: number; status: DayStatus }[];
}

export interface SlotsView {
  date: string;
  durationMin: number;
  slots: { time: string; endTime: string; available: boolean; freeCount: number }[];
}

export interface BarbersAtView {
  date: string;
  time: string;
  durationMin: number;
  freeCount: number;
  barbers: { id: string; name: string; headline: string; avatar: Avatar; rating: Rating; free: boolean; busyUntil: string | null }[];
}

export interface CheckoutOptions {
  methods: { PIX: boolean; CREDIT: boolean; DEBIT: boolean; CASH: boolean };
  maxInstallments: number;
  installmentOptions: { count: number; valueCents: number; label: string }[];
  gateway: 'STRIPE' | 'FAKE';
  totalCents: number;
  cancellationFeeCents: number;
}

export type CheckoutResult =
  | { kind: 'cash'; code: string }
  | { kind: 'pix'; code: string; paymentId: string; pixCode: string | null; qrImageUrl: string | null; expiresAt: string | null; amountCents: number }
  | { kind: 'card'; code: string; paymentId: string; gateway: 'STRIPE' | 'FAKE'; clientSecret: string | null; amountCents: number; installments: number };

export type DisplayStatus =
  | 'CART'
  | 'PROCESSING'
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'LATE'
  | 'READY_FOR_PICKUP'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type OrderStatus = 'CART' | 'PENDING_PAYMENT' | 'SCHEDULED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface PersonRef {
  id: string;
  name: string;
  firstName: string;
  avatar: Avatar;
}

export interface OrderItemView {
  id: string;
  kind: 'SERVICE' | 'PRODUCT';
  serviceId: string | null;
  productId: string | null;
  name: string;
  icon: string;
  categoryName: string;
  listPriceCents: number;
  unitPriceCents: number;
  quantity: number;
  discountCents: number;
  totalCents: number;
  durationMin: number;
  addedByRole: Role;
  addedDuringService: boolean;
  doneAt: string | null;
  deliveredAt: string | null;
}

export interface PaymentView {
  id: string;
  method: string;
  methodLabel: string;
  channel: 'ONLINE' | 'COUNTER';
  provider: string;
  providerRef: string | null;
  status: string;
  amountCents: number;
  feeCents: number;
  installments: number;
  receivedCents: number | null;
  changeCents: number | null;
  cardBrand: string | null;
  cardLast4: string | null;
  recordedByName: string | null;
  confirmedAt: string | null;
  refundedCents: number;
  refundedAt: string | null;
}

export interface OrderView {
  id: string;
  code: string;
  origin: 'SITE' | 'WALK_IN';
  type: 'APPOINTMENT' | 'PICKUP';
  status: OrderStatus;
  displayStatus: DisplayStatus;
  displayLabel: string;
  paymentChoice: 'PIX' | 'CREDIT' | 'DEBIT' | 'CASH' | null;
  paymentChoiceLabel: string | null;
  installments: number;
  customer: PersonRef & { email: string | null; phone: string | null };
  barber: (PersonRef & { headline: string; chair: string | null }) | null;
  anyBarber: boolean;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  durationMin: number;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  paidAt: string | null;
  holdExpiresAt: string | null;
  elapsedSeconds: number;
  paused: boolean;
  items: OrderItemView[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  onlinePaidCents: number;
  refundedCents: number;
  amountDueCents: number;
  payments: PaymentView[];
  pendingPayment: { id: string; method: string; pixCode: string | null; expiresAt: string | null } | null;
  timeline: { type: string; description: string; actorName: string | null; createdAt: string }[];
  late: { minutes: number; fitInAt: string | null; position: number } | null;
  cancel: { allowed: boolean; deadline: string | null };
  completionCode: string | null;
  review: { id: string } | null;
  canReview: boolean;
  productsPending: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Notification {
  id: string;
  type: string;
  tone: string;
  icon: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface CommissionPreview {
  lines: { barberId: string; kind: 'SERVICE' | 'PRODUCT'; baseCents: number; rateBps: number; amountCents: number; label: string }[];
  totalCents: number;
  serviceCents: number;
  productCents: number;
}

export interface StaffAgenda {
  date: string;
  kpis: { total: number; done: number; chairMinutes: number; occupancyPct: number; earningsCents: number; earningsDeltaPct: number | null };
  current: OrderView | null;
  upcoming: OrderView[];
  completed: OrderView[];
  gaps: { time: string; minutes: number }[];
  /** Turnos do barbeiro no dia ("14:00–18:00"); vazio = agenda fechada. */
  workHours: string[];
}

export interface Earnings {
  period: { from: string; to: string; label: string };
  totalCents: number;
  deltaPct: number | null;
  service: { cents: number; baseCents: number; rateBps: number };
  product: { cents: number; baseCents: number; rateBps: number };
  payoutLabel: string;
  kpis: { appointments: number; appointmentsDelta: number; avgTicketCents: number; avgTicketDeltaCents: number; chairHours: number; occupancyPct: number; rating: number | null; ratingCount: number };
  byDay: { date: string; label: string; cents: number }[];
  byCategory: { name: string; cents: number; pct: number }[];
  list: {
    items: { id: string; code: string | null; status: string; origin: string; customerName: string; avatar: Avatar; summary: string; commissionCents: number; detail: string; timeLabel: string | null; rating: string | null }[];
    page: number;
    pageSize: number;
    counts: { all: number; completed: number; cancelled: number };
  };
}

export interface SellableCatalog {
  services: (ServiceCard & { barberIds: string[] })[];
  products: ProductCard[];
}

export interface CounterToday {
  kpis: {
    toReceiveCents: number;
    toReceiveCount: number;
    receivedTodayCents: number;
    receivedCashCents: number;
    toDeliverCount: number;
    pickupCount: number;
    ordersToday: number;
    walkInsToday: number;
  };
  toReceive: (OrderView & { reason: string })[];
  toDeliver: OrderView[];
  cash: { byMethod: Record<string, number>; online: number };
}

export interface FreeBarber {
  id: string;
  name: string;
  firstName: string;
  avatar: Avatar;
  nextFree: string | null;
  freeNow: boolean;
}
