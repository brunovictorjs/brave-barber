'use client';

import { useState } from 'react';
import { addDaysKey, dateKey } from '@/lib/format';

/** Período padrão do painel: últimos 7 dias (como no protótipo). */
export function usePeriod(days = 7, forward = 0) {
  const today = dateKey();
  const [range, setRange] = useState({ from: addDaysKey(today, -(days - 1)), to: addDaysKey(today, forward) });
  return [range, setRange] as const;
}
