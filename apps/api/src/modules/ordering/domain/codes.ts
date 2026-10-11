import { randomInt } from 'node:crypto';

/**
 * Códigos que o cliente fala em voz alta:
 *   • do pedido: BRV-7F2K9 (dígito-letra-dígito-letra-dígito, sem I/O para não confundir com 1/0);
 *   • de conclusão: OK-4821 (só o cliente vê, fecha o atendimento);
 *   • de avulso: AVL-0412 (sequencial, criado no balcão ou pelo barbeiro).
 */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '0123456789';

const pick = (alphabet: string) => alphabet[randomInt(alphabet.length)]!;

export function generateOrderCode(): string {
  return `BRV-${pick(DIGITS)}${pick(LETTERS)}${pick(DIGITS)}${pick(LETTERS)}${pick(DIGITS)}`;
}

export function generateCompletionCode(): string {
  return `OK-${String(randomInt(1000, 10_000))}`;
}

export function formatWalkInCode(sequence: number): string {
  return `AVL-${String(sequence).padStart(4, '0')}`;
}

export function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
}
