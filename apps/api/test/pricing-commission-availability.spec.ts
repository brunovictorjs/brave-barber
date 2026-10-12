import { calculatePrices } from '@/modules/catalog/domain/price-calculator';
import { Offer } from '@/modules/catalog/domain/offer';
import { calculateCommission } from '@/modules/commissions/domain/commission-calculator';
import { computeSlots, nextGap, shifts } from '@/modules/scheduling/domain/availability';
import { emptyWeek, workWindows } from '@/modules/scheduling/domain/staff-schedule';
import { DEFAULT_SETTINGS } from '@/modules/business/domain/settings';
import { zonedTime, toDateKey, minutesOfDay } from '@/shared/domain/business-time';

const comboOffer = Offer.create(
  'off1',
  { name: 'Combo de terça e quarta', discountType: 'PERCENT', discountValue: 2500, usageLimit: null, startsOn: '2026-10-01', endsOn: '2026-10-31', weekdays: [2, 3], serviceIds: ['combo'] },
  new Date('2026-10-01T12:00:00Z'),
);
const combos = [{ comboId: 'combo', comboName: 'Cabelo + barba', componentIds: ['corte', 'barba'], listPriceCents: 8000 }];
const lines = [
  { key: 'a', kind: 'SERVICE' as const, refId: 'corte', listPriceCents: 4500, quantity: 1 },
  { key: 'b', kind: 'SERVICE' as const, refId: 'barba', listPriceCents: 3500, quantity: 1 },
];

describe('Preços: ofertas e combos', () => {
  it('Corte + Barba numa quarta sai pelo preço do combo em oferta (R$ 60)', () => {
    const r = calculatePrices(lines, { day: '2026-10-07', offersByService: new Map([['combo', comboOffer]]), combos });
    expect(r.subtotalCents).toBe(8000);
    expect(r.discountCents).toBe(2000);
    expect(r.totalCents).toBe(6000);
    expect(r.combos).toEqual([{ comboName: 'Cabelo + barba', discountCents: 2000 }]);
    expect(r.lines.reduce((s, l) => s + l.discountCents, 0)).toBe(2000);
  });

  it('num domingo a oferta não vale e o combo não dá desconto', () => {
    const r = calculatePrices(lines, { day: '2026-10-11', offersByService: new Map([['combo', comboOffer]]), combos });
    expect(r.totalCents).toBe(8000);
    expect(r.combos).toHaveLength(0);
  });

  it('oferta direta no serviço muda o preço unitário', () => {
    const r = calculatePrices([{ key: 'c', kind: 'SERVICE', refId: 'combo', listPriceCents: 8000, quantity: 1 }], {
      day: '2026-10-06',
      offersByService: new Map([['combo', comboOffer]]),
      combos,
    });
    expect(r.lines[0]!.unitPriceCents).toBe(6000);
    expect(r.lines[0]!.offerName).toBe('Combo de terça e quarta');
  });
});

describe('Comissões', () => {
  const rates = new Map([
    ['breno', { serviceBps: 6000, productBps: 1500 }],
    ['amanda', { serviceBps: 5500, productBps: 1500 }],
  ]);
  const base = { ratesOf: (id: string) => rates.get(id), categoryRates: new Map([['coloracao', 4500]]), rules: DEFAULT_SETTINGS.commission.rules, wasFitIn: false, reason: 'completed' as const };

  it('execução 60% de R$ 60 + produto 15% de R$ 38 = R$ 41,70', () => {
    const result = calculateCommission({
      ...base,
      barberId: 'breno',
      items: [
        { kind: 'SERVICE', categoryId: 'cabelo', netCents: 3375, addedById: 'lucas', addedByRole: 'CLIENT' },
        { kind: 'SERVICE', categoryId: 'barba', netCents: 2625, addedById: 'lucas', addedByRole: 'CLIENT' },
        { kind: 'PRODUCT', categoryId: 'p', netCents: 3800, addedById: 'breno', addedByRole: 'BARBER' },
      ],
    });
    expect(result.reduce((s, l) => s + l.amountCents, 0)).toBe(4170);
  });

  it('produto comprado pelo cliente no site não paga comissão', () => {
    const result = calculateCommission({
      ...base,
      barberId: 'breno',
      items: [{ kind: 'PRODUCT', categoryId: 'p', netCents: 4200, addedById: 'lucas', addedByRole: 'CLIENT' }],
    });
    expect(result).toHaveLength(0);
  });

  it('exceção de categoria vence o percentual do profissional', () => {
    const [line] = calculateCommission({
      ...base,
      barberId: 'amanda',
      items: [{ kind: 'SERVICE', categoryId: 'coloracao', netCents: 18000, addedById: null, addedByRole: 'CLIENT' }],
    });
    expect(line!.rateBps).toBe(4500);
    expect(line!.amountCents).toBe(8100);
  });

  it('balconista lançando produto não gera comissão para ninguém', () => {
    const result = calculateCommission({
      ...base,
      barberId: 'breno',
      items: [{ kind: 'PRODUCT', categoryId: 'p', netCents: 4200, addedById: 'patricia', addedByRole: 'RECEPTIONIST' }],
    });
    expect(result).toHaveLength(0);
  });
});

describe('Agenda', () => {
  const schedule = { open: 9 * 60, close: 20 * 60, breakStart: 12 * 60 + 30, breakEnd: 13 * 60 + 30 };

  it('não oferece horário que atravessa o intervalo nem quem está ocupado', () => {
    const slots = computeSlots({
      schedule,
      durationMin: 65,
      stepMin: 40,
      bufferMin: 5,
      earliestStartMin: null,
      barberIds: ['breno', 'amanda'],
      busy: new Map([['breno', [{ start: 14 * 60 + 40, end: 15 * 60 + 45 }]]]),
    });
    expect(slots.find((s) => s.minutes === 11 * 60 + 40)).toBeUndefined(); // 11:40 + 65 = 12:45 > intervalo
    const at1410 = slots.find((s) => s.minutes === 14 * 60 + 10)!;
    expect(at1410.freeBarberIds).toEqual(['amanda']);
  });

  it('respeita a antecedência mínima de hoje', () => {
    const slots = computeSlots({ schedule, durationMin: 40, stepMin: 40, bufferMin: 0, earliestStartMin: 15 * 60, barberIds: ['b'], busy: new Map() });
    expect(Math.min(...slots.map((s) => s.minutes))).toBeGreaterThanOrEqual(15 * 60);
  });

  it('encaixe procura a próxima folga do profissional', () => {
    const gap = nextGap(shifts(schedule), [{ start: 16 * 60, end: 17 * 60 }, { start: 17 * 60 + 30, end: 18 * 60 }], 16 * 60 + 10, 25, 5);
    expect(gap).toBe(18 * 60 + 5);
  });

  it('quem trabalha só à tarde não aparece livre de manhã', () => {
    const slots = computeSlots({
      schedule,
      durationMin: 40,
      stepMin: 40,
      bufferMin: 0,
      earliestStartMin: null,
      barberIds: ['breno', 'amanda'],
      busy: new Map(),
      work: new Map([['amanda', [{ start: 14 * 60, end: 18 * 60 }]]]),
    });
    expect(slots.find((s) => s.minutes === 10 * 60 + 20)!.freeBarberIds).toEqual(['breno']);
    expect(slots.find((s) => s.minutes === 14 * 60 + 10)!.freeBarberIds).toEqual(['breno', 'amanda']);
    expect(slots.find((s) => s.minutes === 17 * 60 + 30)!.freeBarberIds).toEqual(['breno']); // 17:30 + 40 passa das 18:00
  });

  it('encaixe respeita o turno do profissional', () => {
    expect(nextGap([{ start: 14 * 60, end: 18 * 60 }], [], 10 * 60, 30, 5)).toBe(14 * 60);
    expect(nextGap([], [], 10 * 60, 30, 5)).toBeNull();
  });

  describe('agenda do profissional', () => {
    const week = emptyWeek().map((d) => (d.weekday === 2 ? { ...d, start: '14:00', end: '18:00' } : d));

    it('por padrão segue os turnos da casa', () => {
      expect(workWindows(schedule, 2, { custom: false, weekly: emptyWeek() }, [])).toEqual([
        { start: 9 * 60, end: 12 * 60 + 30 },
        { start: 13 * 60 + 30, end: 20 * 60 },
      ]);
    });

    it('semana própria fica dentro do horário da casa e folga zera o dia', () => {
      expect(workWindows(schedule, 2, { custom: true, weekly: week }, [])).toEqual([{ start: 14 * 60, end: 18 * 60 }]);
      expect(workWindows(schedule, 3, { custom: true, weekly: week }, [])).toEqual([]);
      const late = emptyWeek().map((d) => ({ ...d, start: '12:00', end: '22:00' }));
      expect(workWindows(schedule, 2, { custom: true, weekly: late }, [])).toEqual([
        { start: 12 * 60, end: 12 * 60 + 30 },
        { start: 13 * 60 + 30, end: 20 * 60 },
      ]);
    });

    it('período aberto amplia e período fechado corta, sempre dentro da casa', () => {
      const own = { custom: true, weekly: week };
      expect(workWindows(schedule, 2, own, [{ kind: 'OPEN', start: 9 * 60, end: 11 * 60 }])).toEqual([
        { start: 9 * 60, end: 11 * 60 },
        { start: 14 * 60, end: 18 * 60 },
      ]);
      expect(workWindows(schedule, 2, own, [{ kind: 'CLOSED', start: 15 * 60, end: 16 * 60 }])).toEqual([
        { start: 14 * 60, end: 15 * 60 },
        { start: 16 * 60, end: 18 * 60 },
      ]);
      expect(workWindows(schedule, 2, own, [{ kind: 'CLOSED', start: 0, end: 24 * 60 }])).toEqual([]);
      expect(workWindows(null, 2, own, [{ kind: 'OPEN', start: 9 * 60, end: 11 * 60 }])).toEqual([]);
    });
  });

  it('converte hora local do negócio para UTC e de volta', () => {
    const d = zonedTime('2026-10-07', 14 * 60 + 40, 'America/Recife');
    expect(d.toISOString()).toBe('2026-10-07T17:40:00.000Z');
    expect(toDateKey(d, 'America/Recife')).toBe('2026-10-07');
    expect(minutesOfDay(d, 'America/Recife')).toBe(880);
  });
});
