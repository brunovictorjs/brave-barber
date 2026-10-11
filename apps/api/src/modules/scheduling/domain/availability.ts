/**
 * Cálculo puro de horários livres. Tudo em minutos do dia (hora local da casa).
 *
 * Um horário S serve para um atendimento de D minutos quando:
 *   • [S, S+D] cabe inteiro num turno (não atravessa o intervalo nem o fechamento);
 *   • S respeita a antecedência mínima (para hoje);
 *   • há pelo menos um profissional apto sem nada marcado em [S−folga, S+D+folga).
 */
export interface Interval {
  start: number;
  end: number;
}

export interface DaySchedule {
  open: number;
  close: number;
  breakStart: number | null;
  breakEnd: number | null;
}

export interface SlotQuery {
  schedule: DaySchedule | null;
  durationMin: number;
  stepMin: number;
  bufferMin: number;
  /** Primeiro minuto em que ainda dá para marcar (hoje); null para dias futuros. */
  earliestStartMin: number | null;
  barberIds: string[];
  busy: Map<string, Interval[]>;
}

export interface Slot {
  minutes: number;
  freeBarberIds: string[];
}

export function shifts(schedule: DaySchedule): Interval[] {
  if (schedule.breakStart !== null && schedule.breakEnd !== null && schedule.breakStart < schedule.breakEnd) {
    return [
      { start: schedule.open, end: schedule.breakStart },
      { start: schedule.breakEnd, end: schedule.close },
    ].filter((s) => s.end > s.start);
  }
  return [{ start: schedule.open, end: schedule.close }];
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function isBarberFree(busy: Interval[] | undefined, start: number, duration: number, buffer: number): boolean {
  if (!busy?.length) return true;
  const wanted = { start: start - buffer, end: start + duration + buffer };
  return !busy.some((b) => overlaps(wanted, b));
}

export function computeSlots(q: SlotQuery): Slot[] {
  if (!q.schedule || q.durationMin <= 0 || q.barberIds.length === 0) return [];
  const slots: Slot[] = [];
  for (const shift of shifts(q.schedule)) {
    for (let start = shift.start; start + q.durationMin <= shift.end; start += q.stepMin) {
      if (q.earliestStartMin !== null && start < q.earliestStartMin) continue;
      const free = q.barberIds.filter((id) => isBarberFree(q.busy.get(id), start, q.durationMin, q.bufferMin));
      slots.push({ minutes: start, freeBarberIds: free });
    }
  }
  return slots;
}

/**
 * Próxima janela livre de um profissional a partir de `fromMin`, para encaixe
 * de quem chegou atrasado. Não respeita a grade de horários: qualquer folga serve.
 */
export function nextGap(schedule: DaySchedule | null, busy: Interval[], fromMin: number, durationMin: number, bufferMin: number): number | null {
  if (!schedule) return null;
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  for (const shift of shifts(schedule)) {
    let cursor = Math.max(shift.start, fromMin);
    for (const b of sorted) {
      if (b.end + bufferMin <= cursor) continue;
      if (b.start - bufferMin >= cursor + durationMin) break;
      cursor = Math.max(cursor, b.end + bufferMin);
    }
    if (cursor + durationMin <= shift.end) return cursor;
  }
  return null;
}

/** Escolhe o profissional para "qualquer profissional": quem tem menos minutos ocupados no dia. */
export function pickLeastBusy(candidates: string[], busy: Map<string, Interval[]>): string | null {
  let best: string | null = null;
  let bestLoad = Infinity;
  for (const id of candidates) {
    const load = (busy.get(id) ?? []).reduce((sum, b) => sum + (b.end - b.start), 0);
    if (load < bestLoad) {
      best = id;
      bestLoad = load;
    }
  }
  return best;
}
