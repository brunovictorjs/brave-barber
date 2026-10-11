/* eslint-disable no-console */
/**
 * Dados de demonstração espelhando o protótipo aprovado: equipe, catálogo,
 * ofertas, agenda de hoje (relativa à hora em que o seed roda) e um mês de
 * histórico com pagamentos, comissões e avaliações.
 *
 *   npm run db:seed        (apaga e recria tudo)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { addDays, toDateKey, weekdayOf, zonedTime, minutesOfDay } from '../src/shared/domain/business-time';
import { calculateCommission } from '../src/modules/commissions/domain/commission-calculator';
import { DEFAULT_SETTINGS } from '../src/modules/business/domain/settings';

const prisma = new PrismaClient();
const TZ = process.env.BUSINESS_TIMEZONE ?? 'America/Recife';
const NOW = new Date();
const TODAY = toDateKey(NOW, TZ);

// Gerador determinístico: o histórico sai igual a cada seed.
let seed = 20261007;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)]!;
const chance = (p: number) => rand() < p;

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const usedCodes = new Set<string>();
function code(fixed?: string): string {
  if (fixed) {
    usedCodes.add(fixed);
    return fixed;
  }
  for (;;) {
    const d = () => Math.floor(rand() * 10);
    const l = () => LETTERS[Math.floor(rand() * LETTERS.length)];
    const c = `BRV-${d()}${l()}${d()}${l()}${d()}`;
    if (!usedCodes.has(c)) {
      usedCodes.add(c);
      return c;
    }
  }
}
let walkSeq = 300;
const completion = () => `OK-${1000 + Math.floor(rand() * 9000)}`;

function fee(method: string, cents: number): number {
  if (method === 'PIX') return Math.round(cents * 0.0119);
  if (method === 'DEBIT') return Math.round(cents * 0.0239);
  if (method === 'CREDIT') return Math.round(cents * 0.0399) + 39;
  return 0;
}

/** Hora local de hoje + deslocamento em minutos a partir de agora (arredondado em 5). */
function nowPlus(minutes: number): Date {
  const base = Math.floor(minutesOfDay(NOW, TZ) / 5) * 5;
  return zonedTime(TODAY, base + minutes, TZ);
}

async function reset() {
  const tables = [
    'commissionLine', 'productReview', 'review', 'payment', 'orderEvent', 'orderItem', 'order', 'favorite', 'notification', 'emailLog',
    'offerService', 'offer', 'serviceComponent', 'serviceBarber', 'serviceMedia', 'service', 'productMedia', 'product',
    'commissionCategoryRule', 'category', 'staffProfile', 'legalAcceptance', 'legalDocument', 'closure', 'setting', 'user',
  ] as const;
  for (const t of tables) await (prisma[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
}

async function main() {
  console.log(`Seed da Brave Barber · hoje é ${TODAY} (${TZ})`);
  await reset();

  // ── Configurações ───────────────────────────────────────────────────────
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.create({ data: { key, value: JSON.stringify(value) } });
  }
  const year = Number(TODAY.slice(0, 4));
  const oct12 = `${TODAY >= `${year}-10-12` ? year + 1 : year}-10-12`;
  await prisma.closure.createMany({
    data: [
      { startsOn: zonedTime(oct12, 0, TZ), endsOn: zonedTime(oct12, 0, TZ), reason: 'Feriado · casa fechada o dia todo' },
      { startsOn: zonedTime(`${year}-12-24`, 0, TZ), endsOn: zonedTime(`${year}-12-26`, 0, TZ), reason: 'Recesso de fim de ano' },
    ],
  });

  // ── Pessoas ─────────────────────────────────────────────────────────────
  const mk = async (email: string, firstName: string, lastName: string, roles: string, extra: Record<string, unknown> = {}, createdAt?: Date) =>
    prisma.user.create({ data: { email, firstName, lastName, roles, onboardedAt: NOW, lastAccessAt: new Date(NOW.getTime() - rand() * 86_400_000), createdAt: createdAt ?? new Date('2024-01-10'), ...extra } });

  const admin = await mk('admin@bravebarber.com.br', 'Administração', 'Brave Barber', 'ADMIN');
  const breno = await mk('breno@bravebarber.com.br', 'Breno', 'Lima', 'BARBER,ADMIN', {
    about: 'Barbeiro há 11 anos, especialista em degradê e barba desenhada. Trabalho com navalha e acabamento na máquina zero.',
    specialties: JSON.stringify(['Degradê', 'Barba', 'Navalha']),
  });
  const amanda = await mk('amanda@bravebarber.com.br', 'Amanda', 'Moreira', 'BARBER', {
    about: 'Trabalho com loiros desde 2016. Gosto de explicar cada etapa da descoloração para você saber exatamente o que está acontecendo no seu cabelo.',
    specialties: JSON.stringify(['Platinado', 'Luzes', 'Matização']),
  });
  const bruno = await mk('bruno@bravebarber.com.br', 'Bruno', 'Tavares', 'BARBER', { specialties: JSON.stringify(['Clássico', 'Infantil']) });
  const fernanda = await mk('fernanda@bravebarber.com.br', 'Fernanda', 'Nunes', 'BARBER', {
    about: 'Barboterapia com toalha quente, óleo e massagem. Barba bem cuidada é ritual, não pressa.',
    specialties: JSON.stringify(['Barboterapia', 'Navalha']),
  });
  const patricia = await mk('patricia@bravebarber.com.br', 'Patrícia', 'Lopes', 'RECEPTIONIST');
  await prisma.staffProfile.createMany({
    data: [
      { userId: breno.id, headline: 'Degradê e navalha', sinceYear: 2019, chairLabel: 'cadeira 2', serviceCommissionBps: 6000, productCommissionBps: 1500 },
      { userId: amanda.id, headline: 'Coloração e luzes', sinceYear: 2021, chairLabel: 'cadeira 3', serviceCommissionBps: 5500, productCommissionBps: 1500 },
      { userId: bruno.id, headline: 'Clássico e infantil', sinceYear: 2020, chairLabel: 'cadeira 1', serviceCommissionBps: 6000, productCommissionBps: 1200 },
      { userId: fernanda.id, headline: 'Barboterapia', sinceYear: 2022, chairLabel: 'cadeira 1', serviceCommissionBps: 5800, productCommissionBps: 1500 },
    ],
  });
  const barbers = [breno, amanda, bruno, fernanda];

  const clientData: [string, string, string, string | null, string][] = [
    ['lucas.reis@gmail.com', 'Lucas', 'Reis', '(81) 9 9123-4455', '2025-01-12'],
    ['carla.dias@gmail.com', 'Carla', 'Dias', '(81) 9 8812-4409', '2024-03-02'],
    ['pedro.nakamura@gmail.com', 'Pedro', 'Nakamura', null, '2025-06-20'],
    ['tiago.alves@gmail.com', 'Tiago', 'Alves', '(81) 9 9988-1020', '2025-02-14'],
    ['marina.correa@gmail.com', 'Marina', 'Corrêa', '(81) 9 9771-3344', '2024-09-01'],
    ['helena.braga@gmail.com', 'Helena', 'Braga', '(81) 9 9654-2211', '2024-11-11'],
    ['julia.teles@gmail.com', 'Júlia', 'Teles', null, '2025-04-04'],
    ['rafael.pinto@gmail.com', 'Rafael', 'Pinto', '(81) 9 9311-8877', '2025-03-15'],
    ['otavio.mendes@gmail.com', 'Otávio', 'Mendes', null, '2025-05-09'],
    ['ana.lucia@gmail.com', 'Ana', 'Lúcia', '(81) 9 9100-2030', '2025-07-21'],
    ['rita.gomes@gmail.com', 'Rita', 'Gomes', '(81) 9 9234-5566', '2025-08-08'],
    ['marcos.vilela@gmail.com', 'Marcos', 'Vilela', null, '2025-02-28'],
    ['bruna.castro@gmail.com', 'Bruna', 'Castro', '(81) 9 9455-6677', '2025-01-30'],
    ['paula.souza@gmail.com', 'Paula', 'Souza', null, '2024-12-05'],
  ];
  const clients: Record<string, Awaited<ReturnType<typeof mk>>> = {};
  for (const [email, first, last, phone, since] of clientData) {
    clients[first] = await mk(email, first, last, 'CLIENT', { phone }, new Date(since));
  }

  // ── Catálogo ────────────────────────────────────────────────────────────
  const cat = async (name: string, slug: string, kind: 'SERVICE' | 'PRODUCT', icon: string, position: number) =>
    prisma.category.create({ data: { name, slug, kind, icon, position } });
  const cCabelo = await cat('Cabelo', 'cabelo', 'SERVICE', 'scissor', 0);
  const cBarba = await cat('Barba', 'barba', 'SERVICE', 'beard', 1);
  const cColor = await cat('Coloração', 'coloracao', 'SERVICE', 'drop', 2);
  const cCombo = await cat('Combos', 'combos', 'SERVICE', 'scissor', 3);
  const cInf = await cat('Infantil', 'infantil', 'SERVICE', 'scissor', 4);
  const pCabelo = await cat('Cabelo', 'produtos-cabelo', 'PRODUCT', 'bag', 0);
  const pBarba = await cat('Barba', 'produtos-barba', 'PRODUCT', 'beard', 1);
  const pAcc = await cat('Acessórios', 'acessorios', 'PRODUCT', 'razor', 2);
  await prisma.commissionCategoryRule.createMany({
    data: [
      { categoryId: cColor.id, rateBps: 4500, reason: 'produto por conta da casa' },
      { categoryId: cCombo.id, rateBps: 6200, reason: 'incentivo de ticket maior' },
    ],
  });

  const svcDefs = [
    { key: 'corte', name: 'Corte de cabelo', cat: cCabelo, min: 40, price: 4500, icon: 'scissor', barbers: [breno, bruno, fernanda], summary: 'Corte na tesoura e máquina, com lavagem e finalização.',
      description: '## Como funciona\n\nConversa rápida sobre o estilo, corte na tesoura e na máquina, lavagem e finalização com pomada.\n\n## O que está incluso\n\n- Lavagem com shampoo da casa\n- Corte e acabamento na navalha\n- Finalização com pomada\n' },
    { key: 'platinar', name: 'Platinar o cabelo', cat: cColor, min: 150, price: 18000, icon: 'drop', barbers: [amanda, fernanda], isNew: true, summary: 'Descoloração completa com reconstrução e matização.',
      description: '## Como funciona\n\nDescoloração em até **três sessões de produto** com reconstrução entre elas, matização no tom que você escolher e finalização com máscara de hidratação.\n\n## O que está incluso\n\n- Teste de mecha antes de começar\n- Reconstrução com queratina\n- Matização e finalização\n\n> Cabelos já descoloridos podem precisar de uma sessão extra. O profissional avalia na cadeira e avisa antes de cobrar qualquer diferença.\n' },
    { key: 'barba', name: 'Desenhar barba', cat: cBarba, min: 25, price: 3500, icon: 'beard', barbers: [breno, bruno, fernanda], summary: 'Barba desenhada na navalha com toalha quente.',
      description: '## Como funciona\n\nDesenho do contorno na navalha, aparo na máquina e toalha quente.\n\n## O que está incluso\n\n- Toalha quente\n- Contorno na navalha\n- Óleo pós-barba\n' },
    { key: 'combo', name: 'Cabelo + barba', cat: cCombo, min: 65, price: 8000, icon: 'scissor', barbers: [breno, bruno, fernanda], summary: 'Corte de cabelo e barba desenhada no mesmo horário.',
      description: '## Como funciona\n\nCorte de cabelo completo seguido da barba desenhada, no mesmo horário e com o mesmo profissional.\n\n## O que está incluso\n\n- Corte de cabelo\n- Desenhar barba\n' },
    { key: 'navalha', name: 'Barba na navalha', cat: cBarba, min: 45, price: 5500, icon: 'razor', barbers: [breno, fernanda], isNew: true, summary: 'Barba tradicional feita inteira na navalha.',
      description: '## Como funciona\n\nBarba completa na navalha, com espuma quente e toalha.\n\n## O que está incluso\n\n- Preparação com toalha quente\n- Barbear na navalha\n- Balm calmante\n' },
    { key: 'degrade', name: 'Degradê fade', cat: cCabelo, min: 50, price: 6000, icon: 'scissor', barbers: [breno, bruno], isNew: true, summary: 'Degradê do zero com transição suave.',
      description: '## Como funciona\n\nDegradê feito na máquina do zero, transição suave e acabamento na navalha.\n\n## O que está incluso\n\n- Degradê na máquina\n- Acabamento na navalha\n- Finalização\n' },
    { key: 'luzes', name: 'Luzes', cat: cColor, min: 110, price: 15000, icon: 'drop', barbers: [amanda], summary: 'Mechas iluminadas com papel ou touca.',
      description: '## Como funciona\n\nMechas iluminadas no tom combinado, com matização e finalização.\n\n## O que está incluso\n\n- Mechas no papel ou touca\n- Matização\n- Finalização\n' },
    { key: 'sobrancelha', name: 'Sobrancelha', cat: cBarba, min: 15, price: 2000, icon: 'brow', barbers: [breno, bruno, fernanda], summary: 'Limpeza e desenho da sobrancelha.', description: '## Como funciona\n\nLimpeza e desenho da sobrancelha na navalha ou pinça.\n' },
    { key: 'matizacao', name: 'Matização', cat: cColor, min: 40, price: 7000, icon: 'drop', barbers: [amanda, breno], summary: 'Corrige o tom do loiro e tira o amarelado.', description: '## Como funciona\n\nAplicação de matizador para corrigir o tom e tirar o amarelado.\n' },
    { key: 'hidratacao', name: 'Hidratação', cat: cCabelo, min: 30, price: 4000, icon: 'spark', barbers: [breno, amanda, bruno, fernanda], summary: 'Máscara de tratamento para cabelo ressecado.', description: '## Como funciona\n\nLavagem, máscara de hidratação com calor e finalização.\n' },
    { key: 'barboterapia', name: 'Barboterapia', cat: cBarba, min: 40, price: 5000, icon: 'beard', barbers: [fernanda, breno], summary: 'Ritual completo de cuidado da barba.', description: '## Como funciona\n\nToalha quente, esfoliação, barba feita, óleo e massagem facial.\n' },
    { key: 'infantil', name: 'Corte infantil', cat: cInf, min: 30, price: 4000, icon: 'scissor', barbers: [bruno], status: 'DRAFT', summary: 'Corte para crianças até 12 anos.', description: '## Como funciona\n\nCorte com paciência e cadeira adaptada para crianças até 12 anos.\n' },
  ];
  const svc: Record<string, { id: string; name: string; price: number; min: number; catId: string; catName: string; icon: string }> = {};
  for (const d of svcDefs) {
    const s = await prisma.service.create({
      data: {
        slug: d.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        name: d.name,
        categoryId: d.cat.id,
        priceCents: d.price,
        durationMin: d.min,
        summary: d.summary,
        description: d.description,
        icon: d.icon,
        status: d.status ?? 'ACTIVE',
        isNew: !!d.isNew,
        createdAt: d.isNew ? new Date(`${TODAY.slice(0, 8)}01T12:00:00Z`) : new Date('2025-01-01'),
      },
    });
    await prisma.serviceBarber.createMany({ data: d.barbers.map((b) => ({ serviceId: s.id, barberId: b.id })) });
    svc[d.key] = { id: s.id, name: d.name, price: d.price, min: d.min, catId: d.cat.id, catName: d.cat.name, icon: d.icon };
  }
  await prisma.serviceComponent.createMany({ data: [{ comboId: svc.combo!.id, componentId: svc.corte!.id }, { comboId: svc.combo!.id, componentId: svc.barba!.id }] });

  const prodDefs: [string, string, typeof pCabelo, string, number, string, string | null, boolean][] = [
    ['pomada-modeladora', 'Pomada modeladora', pCabelo, 'efeito seco · 120 g', 4500, 'bag', null, true],
    ['pomada-niveladora', 'Pomada niveladora', pCabelo, 'para degradê · 100 g', 4200, 'bag', 'Mais vendido', true],
    ['creme-de-pentear', 'Creme de pentear', pCabelo, 'cachos e crespos · 250 ml', 3600, 'spark', null, true],
    ['shampoo-e-condicionador', 'Shampoo e condicionador', pCabelo, 'kit 2 × 250 ml', 6800, 'drop', null, true],
    ['oleo-para-barba', 'Óleo para barba', pBarba, 'amadeirado · 30 ml', 3800, 'drop', null, true],
    ['creme-de-barbear', 'Creme de barbear', pBarba, 'pele sensível · 200 g', 3200, 'beard', null, true],
    ['navalha-profissional', 'Navalha profissional', pAcc, 'aço inox · lâmina trocável', 5500, 'razor', null, true],
    ['esponja-nudred', 'Esponja nudred', pAcc, 'para twist e dread', 3000, 'spark', null, true],
    ['balm-pos-barba', 'Balm pós-barba', pBarba, '100 ml', 3400, 'beard', null, false],
  ];
  const prodDescriptions: Record<string, string> = {
    'pomada-modeladora': 'Fixação forte com efeito seco, para penteados com textura que duram o dia todo.\n\n## Como usar\n\n- Aqueça uma pequena quantidade nas mãos\n- Aplique no cabelo seco, da raiz às pontas\n- Modele com os dedos ou com o pente',
    'pomada-niveladora': 'Fixação média e efeito matte, para acabamento de degradê. É a mesma que usamos na cadeira.\n\n## O que você leva\n\n- Pote de 100 g\n- Rende cerca de 2 meses de uso diário',
    'creme-de-pentear': 'Define cachos e crespos sem pesar, com controle de frizz e brilho natural.',
    'shampoo-e-condicionador': 'Kit para uso diário: limpa sem ressecar e deixa o fio macio. Indicado para todos os tipos de cabelo.',
    'oleo-para-barba': 'Hidrata os fios e a pele por baixo da barba, com fragrância amadeirada suave.\n\n## Como usar\n\n- Pingue 3 a 4 gotas na palma\n- Espalhe na barba ainda úmida\n- Penteie para distribuir\n\n> Use todos os dias depois do banho para a barba ficar macia e sem coceira.',
    'creme-de-barbear': 'Espuma cremosa para pele sensível, que protege contra irritação e deixa a lâmina deslizar.',
    'navalha-profissional': 'Navalha em aço inox com lâmina trocável, a mesma das nossas cadeiras. Acompanha 5 lâminas.',
    'esponja-nudred': 'Esponja de furos para criar twists e dreads curtos em poucos minutos.',
    'balm-pos-barba': 'Acalma a pele depois do barbear e reduz a vermelhidão.',
  };
  const prod: Record<string, { id: string; name: string; price: number; catId: string; catName: string; icon: string }> = {};
  for (const [slug, name, c, detail, price, icon, highlight, available] of prodDefs) {
    const p = await prisma.product.create({
      data: { slug, name, categoryId: c.id, detail, priceCents: price, icon, highlight, available, description: prodDescriptions[slug] ?? '' },
    });
    prod[slug] = { id: p.id, name, price, catId: c.id, catName: c.name, icon };
  }

  // Ofertas: combo de terça e quarta (−25%) e hidratação de primavera.
  const combo = await prisma.offer.create({
    data: { name: 'Combo de terça e quarta', discountType: 'PERCENT', discountValue: 2500, startsOn: zonedTime(addDays(TODAY, -3), 0, TZ), endsOn: zonedTime(addDays(TODAY, 4), 0, TZ), weekdays: JSON.stringify([2, 3]), usedCount: 41 },
  });
  await prisma.offerService.create({ data: { offerId: combo.id, serviceId: svc.combo!.id } });
  const spring = await prisma.offer.create({
    data: { name: 'Primavera', discountType: 'PERCENT', discountValue: 1000, startsOn: zonedTime(addDays(TODAY, -10), 0, TZ), endsOn: zonedTime(addDays(TODAY, 20), 0, TZ), weekdays: JSON.stringify([2, 3, 4, 5, 6]), usedCount: 7 },
  });
  await prisma.offerService.create({ data: { offerId: spring.id, serviceId: svc.hidratacao!.id } });

  // ── Políticas ───────────────────────────────────────────────────────────
  await prisma.legalDocument.createMany({
    data: [
      {
        kind: 'PRIVACY', version: 3, status: 'PUBLISHED', publishedAt: new Date(`${year}-08-12T12:00:00Z`), editedByName: 'Administração',
        content: '## Quais dados a gente guarda\n\nQuando você entra com o Google, recebemos seu nome, e-mail e foto. O telefone é opcional e só usamos para avisar sobre mudanças no seu agendamento.\n\n## Pagamentos\n\nOs dados do seu cartão são enviados direto ao Stripe e nunca passam pelos nossos servidores. Guardamos apenas o identificador da cobrança, os quatro últimos dígitos e a bandeira.\n\n## Apagar sua conta\n\nVocê pode pedir a exclusão a qualquer momento em Perfil › Configurações. Pedidos concluídos ficam guardados por cinco anos por obrigação fiscal, sem ligação com seu nome.\n',
      },
      {
        kind: 'TERMS', version: 4, status: 'PUBLISHED', publishedAt: new Date(`${year}-09-03T12:00:00Z`), editedByName: 'Administração',
        content: '## O que você está comprando\n\nAo pagar um pedido você reserva um horário com um profissional da casa, pelo tempo estimado dos serviços escolhidos. O pagamento antecipado garante a reserva; no pagamento em dinheiro, o horário fica reservado e você paga no balcão depois do atendimento.\n\n## Cancelamento e reembolso\n\nVocê pode cancelar e receber **100% do valor** a qualquer momento até a hora marcada. Depois dela, o pedido não é mais reembolsável, porque o horário ficou bloqueado para você e não pôde ser vendido a outra pessoa.\n\n## Atraso\n\nChegando atrasado, seu pedido continua válido e você é encaixado na primeira folga entre os agendamentos do dia. Quem chegou no horário tem prioridade. Depois de 90 minutos de atraso, o pedido é tratado como falta.\n\n## Os dois códigos\n\nO código do pedido identifica você na chegada. O código de conclusão, que só aparece no seu aplicativo, fecha o atendimento. Não informe nenhum dos dois antes da hora.\n',
      },
    ],
  });
  const users = await prisma.user.findMany();
  await prisma.legalAcceptance.createMany({
    data: users.flatMap((u) => [
      { userId: u.id, kind: 'PRIVACY', version: 3 },
      { userId: u.id, kind: 'TERMS', version: 4 },
    ]),
  });

  // ── Pedidos ─────────────────────────────────────────────────────────────
  const rates = new Map(
    (await prisma.staffProfile.findMany()).map((p) => [p.userId, { serviceBps: p.serviceCommissionBps, productBps: p.productCommissionBps }]),
  );
  const categoryRates = new Map([[cColor.id, 4500], [cCombo.id, 6200]]);

  type ItemSpec = { s?: keyof typeof svc; p?: keyof typeof prod; qty?: number; byBarber?: boolean; delivered?: boolean };
  interface OrderSpec {
    code?: string;
    customer?: Awaited<ReturnType<typeof mk>>;
    customerName?: string;
    barber?: Awaited<ReturnType<typeof mk>> | null;
    start?: Date | null;
    items: ItemSpec[];
    status: 'CART' | 'SCHEDULED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED';
    choice?: 'PIX' | 'CREDIT' | 'DEBIT' | 'CASH' | null;
    installments?: number;
    origin?: 'SITE' | 'WALK_IN';
    paid?: boolean | 'online-only';
    counterMethod?: 'CASH' | 'STORE_PIX' | 'TERMINAL_DEBIT' | 'TERMINAL_CREDIT';
    counterBy?: Awaited<ReturnType<typeof mk>>;
    startedAt?: Date | null;
    review?: { s: number; b: number; text?: string; home?: boolean; daysAfter?: number };
    combo?: boolean;
    refunded?: boolean;
    cancelReason?: string;
    lateStart?: boolean;
    completionCode?: string;
    createdAt?: Date;
  }

  async function createOrder(spec: OrderSpec) {
    const origin = spec.origin ?? 'SITE';
    const items = spec.items.map((it, position) => {
      if (it.s) {
        const s = svc[it.s]!;
        return { kind: 'SERVICE', serviceId: s.id, productId: null, name: s.name, categoryId: s.catId, categoryName: s.catName, icon: s.icon, listPriceCents: s.price, unitPriceCents: s.price, quantity: 1, discountCents: 0, durationMin: s.min, addedByRole: 'CLIENT', addedById: spec.customer?.id ?? null, addedDuringService: false, position, delivered: false };
      }
      const p = prod[it.p!]!;
      const byBarber = !!it.byBarber;
      return { kind: 'PRODUCT', serviceId: null, productId: p.id, name: p.name, categoryId: p.catId, categoryName: p.catName, icon: p.icon, listPriceCents: p.price, unitPriceCents: p.price, quantity: it.qty ?? 1, discountCents: 0, durationMin: 0, addedByRole: byBarber ? 'BARBER' : 'CLIENT', addedById: byBarber ? spec.barber?.id ?? null : spec.customer?.id ?? null, addedDuringService: byBarber && origin === 'SITE', position, delivered: !!it.delivered };
    });
    if (spec.combo) {
      const corte = items.find((i) => i.serviceId === svc.corte!.id);
      const barba = items.find((i) => i.serviceId === svc.barba!.id);
      if (corte && barba) {
        corte.discountCents = 1125;
        barba.discountCents = 875;
      }
    }
    const duration = items.reduce((s, i) => s + i.durationMin, 0);
    const subtotal = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
    const discount = items.reduce((s, i) => s + i.discountCents, 0);
    const total = subtotal - discount;
    const services = items.filter((i) => i.kind === 'SERVICE');
    const type = services.length ? 'APPOINTMENT' : 'PICKUP';
    const start = spec.start ?? null;
    const end = start ? new Date(start.getTime() + duration * 60_000) : null;
    const created = spec.createdAt ?? (origin === 'WALK_IN' && start ? start : start ? new Date(start.getTime() - (1 + rand() * 4) * 86_400_000) : NOW);
    const startedAt = spec.status === 'IN_SERVICE' || spec.status === 'COMPLETED' ? spec.startedAt ?? start : null;
    const completedAt = spec.status === 'COMPLETED' ? new Date((startedAt ?? start ?? NOW).getTime() + (duration + Math.round((rand() - 0.5) * 10)) * 60_000) : null;

    const onlinePaid = spec.choice && spec.choice !== 'CASH' && spec.status !== 'CART' ? (spec.paid === 'online-only' ? services.reduce((s, i) => s + i.unitPriceCents - i.discountCents, 0) + items.filter((i) => i.kind === 'PRODUCT' && i.addedByRole === 'CLIENT').reduce((s, i) => s + i.unitPriceCents * i.quantity, 0) : total) : 0;
    const counterPaid = spec.paid === true ? total - onlinePaid : 0;
    const paidCents = onlinePaid + counterPaid;

    const order = await prisma.order.create({
      data: {
        code: spec.code ?? (origin === 'WALK_IN' ? `AVL-${String(walkSeq++).padStart(4, '0')}` : code()),
        origin,
        type,
        status: spec.status,
        paymentChoice: spec.status === 'CART' ? null : spec.choice ?? null,
        installments: spec.installments ?? 1,
        customerId: spec.customer?.id ?? null,
        customerName: spec.customer ? `${spec.customer.firstName} ${spec.customer.lastName}` : spec.customerName ?? '',
        customerPhone: spec.customer?.phone ?? null,
        barberId: spec.barber?.id ?? null,
        scheduledStart: start,
        scheduledEnd: end,
        startedAt,
        completedAt,
        cancelledAt: spec.status === 'CANCELLED' ? new Date((start ?? NOW).getTime() - 3 * 3600_000) : null,
        cancelReason: spec.cancelReason ?? (spec.status === 'CANCELLED' ? 'Cancelado pelo cliente' : null),
        completionCode: type === 'APPOINTMENT' && origin === 'SITE' && spec.status !== 'CART' ? spec.completionCode ?? completion() : null,
        createdById: origin === 'WALK_IN' ? spec.barber?.id : spec.customer?.id,
        subtotalCents: subtotal,
        discountCents: discount,
        totalCents: total,
        paidCents,
        refundedCents: spec.refunded ? onlinePaid : 0,
        paidAt: paidCents >= total && paidCents > 0 ? created : null,
        createdAt: created,
        items: {
          create: items.map(({ delivered, ...i }) => ({
            ...i,
            doneAt: spec.status === 'COMPLETED' && i.kind === 'SERVICE' ? completedAt : null,
            deliveredAt: delivered || (spec.status === 'COMPLETED' && i.kind === 'PRODUCT') ? completedAt ?? created : null,
          })),
        },
      },
    });

    const events: { type: string; description: string; createdAt: Date; meta?: string; actorName?: string }[] = [];
    if (origin === 'SITE') events.push({ type: 'cart', description: 'Criado no carrinho', createdAt: new Date(created.getTime() - 180_000) });
    if (onlinePaid) {
      const method = spec.choice!;
      const label = method === 'PIX' ? 'Pix' : method === 'CREDIT' ? `cartão de crédito${(spec.installments ?? 1) > 1 ? ` ${spec.installments}x` : ''}` : 'cartão de débito';
      await prisma.payment.create({
        data: {
          orderId: order.id, method, channel: 'ONLINE', provider: 'FAKE', providerRef: `seed_${order.code}`, status: spec.refunded ? 'REFUNDED' : 'SUCCEEDED',
          amountCents: onlinePaid, feeCents: fee(method, onlinePaid), installments: spec.installments ?? 1, confirmedAt: created,
          cardBrand: method === 'PIX' ? null : 'visa', cardLast4: method === 'PIX' ? null : '4242',
          refundedAt: spec.refunded ? order.cancelledAt : null, refundedCents: spec.refunded ? onlinePaid : 0, createdAt: created,
        },
      });
      events.push({ type: 'paid', description: `Pago com ${label} · R$ ${(onlinePaid / 100).toFixed(0)}`, createdAt: created });
    }
    if (spec.choice === 'CASH' && origin === 'SITE') events.push({ type: 'reserved_cash', description: 'Horário reservado · pagamento em dinheiro no balcão', createdAt: created });
    if (origin === 'WALK_IN') events.push({ type: 'walk_in_created', description: `Pedido avulso criado por ${spec.barber?.firstName}`, createdAt: startedAt ?? created });
    if (startedAt) events.push({ type: 'started', description: origin === 'SITE' ? 'Atendimento iniciado com o código' : 'Atendimento iniciado sem código (avulso)', createdAt: startedAt, meta: JSON.stringify({ late: !!spec.lateStart }), actorName: spec.barber?.firstName });
    if (counterPaid > 0) {
      const method = spec.counterMethod ?? 'CASH';
      const by = spec.counterBy ?? spec.barber ?? patricia;
      await prisma.payment.create({
        data: { orderId: order.id, method, channel: 'COUNTER', provider: 'NONE', status: 'SUCCEEDED', amountCents: counterPaid, recordedById: by.id, recordedByName: `${by.firstName} ${by.lastName}`, confirmedAt: completedAt ?? NOW, createdAt: completedAt ?? NOW },
      });
      events.push({ type: 'counter_payment', description: `R$ ${(counterPaid / 100).toFixed(0)} recebidos no balcão · ${by.firstName}`, createdAt: completedAt ?? NOW });
    }
    if (completedAt) events.push({ type: 'completed', description: origin === 'SITE' ? 'Concluído com o código de conclusão' : 'Concluído', createdAt: completedAt });
    if (spec.status === 'CANCELLED') events.push({ type: 'cancelled', description: `Cancelado pelo cliente · estorno de R$ ${(onlinePaid / 100).toFixed(0)}`, createdAt: order.cancelledAt! });
    if (events.length) await prisma.orderEvent.createMany({ data: events.map((e) => ({ orderId: order.id, type: e.type, description: e.description, createdAt: e.createdAt, meta: e.meta ?? '{}', actorName: e.actorName ?? null })) });

    if (spec.status === 'COMPLETED' && spec.barber) {
      const lines = calculateCommission({
        barberId: spec.barber.id,
        items: items.map((i) => ({ kind: i.kind as 'SERVICE' | 'PRODUCT', categoryId: i.categoryId, netCents: i.unitPriceCents * i.quantity - i.discountCents, addedById: i.addedById, addedByRole: i.addedByRole })),
        ratesOf: (id) => rates.get(id),
        categoryRates,
        rules: DEFAULT_SETTINGS.commission.rules,
        wasFitIn: !!spec.lateStart,
        reason: 'completed',
      });
      if (lines.length) await prisma.commissionLine.createMany({ data: lines.map((l) => ({ ...l, orderId: order.id, createdAt: completedAt! })) });
    }

    if (spec.review && spec.customer && spec.status === 'COMPLETED') {
      const r = spec.review;
      const eligible = r.s === 5 && r.b === 5 && !!r.text;
      await prisma.review.create({
        data: {
          orderId: order.id, customerId: spec.customer.id, barberId: spec.barber?.id, serviceId: services[0]?.serviceId, serviceLabel: services.map((s) => s.name).join(' + '),
          serviceRating: r.s, barberRating: r.b, text: r.text ?? null, showOnHome: eligible && r.home !== false,
          createdAt: new Date(completedAt!.getTime() + (r.daysAfter ?? 0.2) * 86_400_000),
        },
      });
    }
    return order;
  }

  // Agenda de hoje (relativa a agora).
  await createOrder({ code: 'BRV-7F2K9', customer: clients.Lucas, barber: breno, start: nowPlus(-5), items: [{ s: 'corte' }, { s: 'barba' }], combo: true, status: 'SCHEDULED', choice: 'PIX', completionCode: 'OK-4821', createdAt: new Date(NOW.getTime() - 2 * 86_400_000) });
  await createOrder({ code: 'BRV-5R1W8', customer: clients.Tiago, barber: breno, start: nowPlus(70), items: [{ s: 'corte' }], status: 'SCHEDULED', choice: 'DEBIT' });
  await createOrder({ code: 'BRV-6T3D8', customer: clients.Pedro, barber: breno, start: nowPlus(200), items: [{ s: 'barba' }], status: 'SCHEDULED', choice: 'CASH', completionCode: 'OK-7310' });
  await createOrder({ code: 'BRV-3B8M1', customer: clients.Carla, barber: amanda, start: nowPlus(-34), items: [{ s: 'platinar' }, { p: 'shampoo-e-condicionador', byBarber: false }], status: 'SCHEDULED', choice: 'CREDIT', installments: 3, completionCode: 'OK-9174' });
  await createOrder({ code: 'BRV-6Q2X5', customer: clients.Helena, barber: amanda, start: nowPlus(-120), startedAt: nowPlus(-118), items: [{ s: 'luzes' }], status: 'IN_SERVICE', choice: 'PIX' });
  await createOrder({ code: 'BRV-1M8S5', customer: clients.Rita, barber: fernanda, start: nowPlus(120), items: [{ s: 'barboterapia' }, { s: 'hidratacao' }, { s: 'sobrancelha' }], status: 'SCHEDULED', choice: 'CASH' });
  await createOrder({ customer: clients.Otávio, barber: fernanda, start: nowPlus(20), items: [{ s: 'barba' }], status: 'SCHEDULED', choice: 'PIX' });
  await createOrder({ customer: clients.Bruna, barber: fernanda, start: nowPlus(180), items: [{ s: 'barba' }], status: 'SCHEDULED', choice: 'CREDIT' });
  await createOrder({ customer: clients.Marcos, barber: bruno, start: nowPlus(60), items: [{ s: 'corte' }], status: 'SCHEDULED', choice: 'PIX' });
  await createOrder({ code: 'AVL-0412', origin: 'WALK_IN', customerName: 'Rafael Souza', barber: breno, start: nowPlus(-200), startedAt: nowPlus(-200), items: [{ s: 'degrade' }, { s: 'barba' }, { s: 'matizacao' }, { p: 'pomada-niveladora', byBarber: true }], status: 'COMPLETED', paid: true, counterMethod: 'CASH', counterBy: breno });
  await createOrder({ code: 'AVL-0413', origin: 'WALK_IN', customerName: 'Marcos Vieira', barber: bruno, start: nowPlus(-100), startedAt: nowPlus(-100), items: [{ s: 'degrade' }, { s: 'barba' }], status: 'COMPLETED', paid: false });
  await createOrder({ code: 'BRV-5K2R7', customer: clients.Ana, items: [{ p: 'pomada-niveladora' }, { p: 'oleo-para-barba' }], status: 'SCHEDULED', choice: 'PIX', createdAt: nowPlus(-240) });
  await createOrder({ code: 'BRV-8H3L2', customer: clients.Júlia, items: [{ s: 'luzes' }, { s: 'corte' }], status: 'CART', createdAt: nowPlus(-600) });

  // Lucas tem um atendimento concluído esperando avaliação e um cancelado.
  await createOrder({ customer: clients.Lucas, barber: bruno, start: zonedTime(addDays(TODAY, -14), 11 * 60, TZ), items: [{ s: 'barba' }], status: 'COMPLETED', choice: 'PIX' });
  await createOrder({ code: 'BRV-2K5P0', customer: clients.Marina, barber: fernanda, start: zonedTime(addDays(TODAY, -2), 9 * 60 + 40, TZ), items: [{ s: 'corte' }], status: 'CANCELLED', choice: 'CREDIT', refunded: true });

  // Avaliações conhecidas do protótipo.
  await createOrder({ code: 'BRV-2A6J8', customer: clients.Marina, barber: amanda, start: zonedTime(addDays(TODAY, -9), 14 * 60, TZ), items: [{ s: 'platinar' }], status: 'COMPLETED', choice: 'CREDIT', installments: 2,
    review: { s: 5, b: 5, text: 'Cheguei com o cabelo castanho escuro e saí platinada sem um fio quebrado. A Amanda explicou cada etapa e o horário bateu certinho.' } });
  await createOrder({ code: 'BRV-9D4T7', customer: clients.Pedro, barber: bruno, start: zonedTime(addDays(TODAY, -5), 11 * 60, TZ), items: [{ s: 'barba' }], status: 'COMPLETED', choice: 'PIX',
    review: { s: 5, b: 5, text: 'Melhor barba que já fiz na vida, sem exagero. Cheguei, mostrei o código e em dois minutos estava na cadeira.' } });
  await createOrder({ customer: clients.Lucas, barber: breno, start: zonedTime(addDays(TODAY, -20), 15 * 60, TZ), items: [{ s: 'corte' }, { s: 'barba' }], combo: true, status: 'COMPLETED', choice: 'PIX',
    review: { s: 5, b: 5, text: 'Degradê impecável e começou no horário certinho. Pagar pelo app e só aparecer faz toda a diferença.' } });
  await createOrder({ customer: clients.Helena, barber: amanda, start: zonedTime(addDays(TODAY, -16), 10 * 60, TZ), items: [{ s: 'luzes' }], status: 'COMPLETED', choice: 'CREDIT',
    review: { s: 5, b: 5, text: 'Atendimento atencioso do começo ao fim. A Amanda mostrou o tom antes de aplicar e ficou do jeito que eu queria.' } });
  await createOrder({ customer: clients.Tiago, barber: breno, start: zonedTime(addDays(TODAY, -3), 15 * 60 + 50, TZ), items: [{ s: 'corte' }], status: 'COMPLETED', choice: 'DEBIT',
    review: { s: 4, b: 4, text: 'Corte muito bom, só achei que ficou pouco tempo no acabamento.' } });
  await createOrder({ code: 'BRV-7T3F2', customer: clients.Júlia, barber: amanda, start: zonedTime(addDays(TODAY, -8), 16 * 60, TZ), items: [{ s: 'luzes' }], status: 'COMPLETED', choice: 'PIX', lateStart: true,
    review: { s: 4, b: 4, text: 'Resultado ótimo, só atrasou uns 20 minutos para começar.' } });
  await createOrder({ code: 'BRV-4N7C6', customer: clients.Rafael, barber: bruno, start: zonedTime(addDays(TODAY, -2), 18 * 60, TZ), items: [{ s: 'combo' }], status: 'COMPLETED', choice: 'PIX', review: { s: 5, b: 4 } });
  await createOrder({ code: 'BRV-6Q2X4', customer: clients.Helena, barber: amanda, start: zonedTime(addDays(TODAY, -2), 14 * 60, TZ), items: [{ s: 'platinar' }], status: 'COMPLETED', choice: 'CREDIT', installments: 2,
    review: { s: 2, b: 4, text: 'O tom saiu mais amarelado do que combinamos e precisei voltar.' } });
  await createOrder({ code: 'BRV-1Z9V3', customer: clients.Otávio, barber: fernanda, start: zonedTime(addDays(TODAY, -2), 10 * 60 + 20, TZ), items: [{ s: 'barba' }], status: 'COMPLETED', choice: 'DEBIT' });
  await createOrder({ customer: clients.Paula, barber: amanda, start: zonedTime(addDays(TODAY, -12), 13 * 60 + 40, TZ), items: [{ s: 'platinar' }], status: 'COMPLETED', choice: 'PIX',
    review: { s: 5, b: 5, text: 'Demorou um pouco mais que o previsto, mas o resultado ficou exatamente no tom que eu pedi.', home: false } });

  // Histórico do mês: atendimentos concluídos em dias de funcionamento.
  const pool: (keyof typeof svc)[][] = [['corte'], ['corte'], ['corte'], ['barba'], ['barba'], ['corte', 'barba'], ['combo'], ['degrade'], ['navalha'], ['platinar'], ['luzes'], ['matizacao'], ['hidratacao'], ['barboterapia'], ['sobrancelha'], ['degrade', 'barba']];
  const texts = ['Atendimento excelente, voltarei com certeza.', 'Pontual e caprichoso.', 'Ficou do jeito que pedi.', 'Ambiente top e profissional atencioso.', 'Muito bom, recomendo.', 'Gostei bastante do resultado.'];
  const clientList = Object.values(clients);
  const hoursSettings = DEFAULT_SETTINGS.hours.weekly;
  for (let back = 30; back >= 1; back--) {
    const day = addDays(TODAY, -back);
    const h = hoursSettings.find((w) => w.weekday === weekdayOf(day));
    if (!h?.open) continue;
    const perDay = 4 + Math.floor(rand() * 5);
    const used = new Map<string, number>();
    for (let i = 0; i < perDay; i++) {
      let group = pick(pool);
      const eligible = barbers.filter((b) => group.every((k) => svcDefs.find((d) => d.key === k)!.barbers.some((x) => x.id === b.id)));
      if (!eligible.length) group = ['corte'];
      const barber = eligible.length ? pick(eligible) : breno;
      const startMin = (used.get(barber.id) ?? 9 * 60) + Math.floor(rand() * 3) * 20;
      const duration = group.reduce((s, k) => s + svc[k]!.min, 0);
      if (startMin + duration > 19 * 60) continue;
      used.set(barber.id, startMin + duration + 10);
      const walkIn = chance(0.08);
      const choice = pick(['PIX', 'PIX', 'PIX', 'CREDIT', 'CREDIT', 'DEBIT', 'CASH'] as const);
      const extraProduct = chance(0.18) ? [{ p: pick(['pomada-niveladora', 'oleo-para-barba', 'pomada-modeladora', 'creme-de-barbear'] as (keyof typeof prod)[]), byBarber: true }] : [];
      const customer = walkIn ? undefined : pick(clientList);
      const cancelled = !walkIn && chance(0.05);
      const reviewed = !walkIn && !cancelled && chance(0.4);
      const sRating = chance(0.8) ? 5 : chance(0.7) ? 4 : 3;
      await createOrder({
        origin: walkIn ? 'WALK_IN' : 'SITE',
        customer,
        customerName: walkIn ? pick(['Gabriel Rocha', 'Diego Martins', 'João Pedro', 'Felipe Araújo']) : undefined,
        barber,
        start: zonedTime(day, startMin, TZ),
        items: [...group.map((k) => ({ s: k })), ...extraProduct],
        combo: group.includes('corte') && group.includes('barba') && [2, 3].includes(weekdayOf(day)),
        status: cancelled ? 'CANCELLED' : 'COMPLETED',
        choice: walkIn ? null : choice,
        installments: choice === 'CREDIT' && chance(0.3) ? 2 : 1,
        paid: walkIn || choice === 'CASH' ? true : extraProduct.length ? true : 'online-only',
        counterMethod: pick(['CASH', 'STORE_PIX', 'TERMINAL_DEBIT', 'TERMINAL_CREDIT'] as const),
        counterBy: walkIn ? barber : patricia,
        refunded: cancelled,
        review: reviewed ? { s: sRating, b: chance(0.85) ? 5 : 4, text: chance(0.7) ? pick(texts) : undefined, home: false } : undefined,
      });
    }
  }

  // Favoritos do Lucas e avisos do Breno.
  await prisma.favorite.createMany({
    data: [
      { userId: clients.Lucas!.id, serviceId: svc.platinar!.id },
      { userId: clients.Lucas!.id, serviceId: svc.combo!.id },
      { userId: clients.Lucas!.id, serviceId: svc.navalha!.id },
      { userId: clients.Lucas!.id, serviceId: svc.degrade!.id },
      { userId: clients.Lucas!.id, serviceId: svc.sobrancelha!.id },
      { userId: clients.Lucas!.id, barberId: amanda.id },
      { userId: clients.Lucas!.id, barberId: breno.id },
    ],
  });
  await prisma.notification.createMany({
    data: [
      { userId: breno.id, type: 'order_paid', tone: 'ok', icon: 'check', title: 'Pedido BRV-7F2K9 pago', body: 'Lucas Reis · hoje', createdAt: new Date(NOW.getTime() - 2 * 60_000) },
      { userId: amanda.id, type: 'customer_late', tone: 'warn', icon: 'clock', title: 'Carla Dias está atrasada', body: 'Encaixe sugerido assim que houver folga', createdAt: new Date(NOW.getTime() - 18 * 60_000) },
      { userId: fernanda.id, type: 'order_cancelled', tone: 'bad', icon: 'refund', title: 'Pedido BRV-2K5P0 cancelado', body: 'Reembolso de R$ 45 emitido', createdAt: new Date(NOW.getTime() - 3600_000), readAt: NOW },
      { userId: breno.id, type: 'review_received', tone: 'n', icon: 'star', title: 'Você recebeu 5 estrelas', body: 'Lucas Reis · Corte de cabelo + Desenhar barba', createdAt: new Date(NOW.getTime() - 86_400_000), readAt: NOW },
    ],
  });
  await prisma.emailLog.createMany({
    data: [
      { event: 'order_paid', to: 'breno@bravebarber.com.br', subject: 'Novo pedido pago · BRV-7F2K9', status: 'SENT', createdAt: new Date(NOW.getTime() - 4 * 60_000) },
      { event: 'customer_late', to: 'amanda@bravebarber.com.br', subject: 'Cliente atrasou · BRV-3B8M1', status: 'SENT', createdAt: new Date(NOW.getTime() - 34 * 60_000) },
      { event: 'reminder_first:x', to: 'julia.teles@gmail.com', subject: 'Lembrete · BRV-8H3L2', status: 'FAILED', error: 'caixa do cliente recusou', createdAt: new Date(NOW.getTime() - 2 * 3600_000) },
    ],
  });

  // Avaliações de produtos: parte de quem comprou e já teve o pedido concluído.
  const productTexts = ['Ótimo produto, recomendo.', 'Uso todo dia, cheiro muito bom.', 'Rende bastante.', 'Igual ao que usam na barbearia.', null, null, 'Bom, mas achei um pouco caro.', 'Chegou certinho no balcão.'];
  const bought = await prisma.orderItem.findMany({
    where: { kind: 'PRODUCT', productId: { not: null }, order: { status: 'COMPLETED', customerId: { not: null } } },
    select: { productId: true, order: { select: { id: true, customerId: true, completedAt: true } } },
  });
  const seen = new Set<string>();
  const productReviews = bought
    .filter((b) => {
      const k = `${b.order.id}:${b.productId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return chance(0.7);
    })
    .map((b) => ({
      orderId: b.order.id,
      productId: b.productId!,
      customerId: b.order.customerId!,
      rating: pick([5, 5, 5, 4, 4, 3]),
      text: pick(productTexts),
      createdAt: new Date((b.order.completedAt ?? NOW).getTime() + 3 * 3600_000),
    }));
  if (productReviews.length) await prisma.productReview.createMany({ data: productReviews });
  await prisma.favorite.createMany({
    data: [
      { userId: clients.Lucas!.id, productId: prod['pomada-niveladora']!.id },
      { userId: clients.Lucas!.id, productId: prod['oleo-para-barba']!.id },
    ],
  });

  const counts = await Promise.all([prisma.user.count(), prisma.service.count(), prisma.product.count(), prisma.order.count(), prisma.review.count()]);
  console.log(`Pronto: ${counts[0]} usuários, ${counts[1]} serviços, ${counts[2]} produtos, ${counts[3]} pedidos, ${counts[4]} avaliações, ${productReviews.length} avaliações de produto.`);
  console.log(`Admin: ${admin.email} · Barbeiro: ${breno.email} · Balconista: ${patricia.email} · Cliente: ${clients.Lucas!.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
