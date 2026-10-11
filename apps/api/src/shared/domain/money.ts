/**
 * Dinheiro em centavos de real. Percentuais em pontos-base (1% = 100 bps).
 * Todas as contas do domínio passam por aqui para evitar ponto flutuante.
 */
export const Money = {
  /** Aplica uma taxa em pontos-base, arredondando para o centavo mais próximo. */
  applyRate(cents: number, rateBps: number): number {
    return Math.round((cents * rateBps) / 10_000);
  },

  sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
  },

  /** "R$ 1.234,50" — some com os centavos quando são zero: "R$ 60". */
  format(cents: number, opts: { forceCents?: boolean } = {}): string {
    const negative = cents < 0;
    const abs = Math.abs(cents);
    const reais = Math.floor(abs / 100);
    const rest = abs % 100;
    const int = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const frac = rest || opts.forceCents ? `,${rest.toString().padStart(2, '0')}` : '';
    return `${negative ? '− ' : ''}R$ ${int}${frac}`;
  },

  /** 6000 → "60%" · 1250 → "12,5%" */
  formatRate(bps: number): string {
    const value = bps / 100;
    return `${Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',')}%`;
  },
};
