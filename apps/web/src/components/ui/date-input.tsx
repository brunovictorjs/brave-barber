'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const toBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function toIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCDate() !== Number(d) || date.getUTCMonth() !== Number(mo) - 1) return null;
  return `${y}-${mo}-${d}`;
}

function mask(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * Data sempre em dd/mm/aaaa, qualquer que seja o idioma do navegador.
 * Recebe e devolve `YYYY-MM-DD`. O botão do calendário abre o seletor nativo.
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  className,
  bare,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  className?: string;
  /** Sem a caixa (dentro de filtros e cabeçalhos que já têm borda). */
  bare?: boolean;
  'aria-label'?: string;
}) {
  const [text, setText] = useState(toBr(value));
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => setText(toBr(value)), [value]);

  const accept = (iso: string | null) => {
    if (!iso) return false;
    if ((min && iso < min) || (max && iso > max)) return false;
    onChange(iso);
    return true;
  };

  const openPicker = () => {
    const el = picker.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };

  return (
    <span className={cn('relative inline-flex items-center gap-1.5', !bare && 'input', className)}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        aria-label={ariaLabel}
        value={text}
        maxLength={10}
        className={cn('min-w-0 border-0 bg-transparent p-0 text-inherit outline-none', bare ? 'w-[86px] font-bold' : 'flex-1')}
        style={{ font: 'inherit', fontVariantNumeric: 'tabular-nums' }}
        onChange={(e) => {
          const next = mask(e.target.value);
          setText(next);
          if (next.length === 10) accept(toIso(next));
        }}
        onBlur={() => {
          if (!accept(toIso(text))) setText(toBr(value));
        }}
      />
      <button type="button" onClick={openPicker} aria-label="Abrir calendário" className="grid cursor-pointer place-items-center border-0 bg-transparent p-0 text-[var(--ink-muted)] hover:text-[var(--ink)]">
        <svg aria-hidden="true" width="15" height="15">
          <use href="#cal" />
        </svg>
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={min}
        max={max}
        onChange={(e) => accept(e.target.value)}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
    </span>
  );
}
