'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('');

/**
 * Teclado do código (BRV-7F2K9 / OK-4821): números e letras, apagar, e também
 * aceita o teclado físico. `prefix` aparece fixo antes dos dígitos.
 */
export function CodePad({ prefix, length, value, onChange, letters = true }: { prefix: string; length: number; value: string; onChange: (v: string) => void; letters?: boolean }) {
  const [abc, setAbc] = useState(false);

  // Ref com o valor atual: o teclado físico não perde dígitos digitados rápido.
  const current = useRef(value);
  current.current = value;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const v = current.current;
      if (e.key === 'Backspace') {
        current.current = v.slice(0, -1);
        onChange(current.current);
      } else if (/^[a-z0-9]$/i.test(e.key) && v.length < length) {
        const ch = e.key.toUpperCase();
        if (!letters && !/\d/.test(ch)) return;
        current.current = v + ch;
        onChange(current.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange, length, letters]);

  const press = (ch: string) => value.length < length && onChange(value + ch);
  const keys = abc ? LETTERS : ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div>
      <div className="rowx mb-5 justify-center !gap-[5px]" aria-live="polite" aria-label={`Código digitado: ${prefix}${value}`}>
        {prefix
          .replace('-', '')
          .split('')
          .map((c, i) => (
            <span key={`p${i}`} className="dig on !w-[32px]">
              {c}
            </span>
          ))}
        <span className="muted text-[20px]">-</span>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={cn('dig !w-[34px]', i < value.length ? 'on' : i === value.length && 'cur')}>
            {value[i] ?? ''}
          </span>
        ))}
      </div>
      <div className={cn('grid gap-[9px]', abc ? 'grid-cols-6' : 'grid-cols-3')}>
        {keys.map((k) => (
          <button key={k} type="button" className={cn('key', abc && '!h-11 !text-[17px]')} onClick={() => press(k)} aria-label={k}>
            {k}
          </button>
        ))}
        {letters ? (
          <button type="button" className={cn('key !text-[14px] tracking-[.1em]', abc && '!h-11 col-span-2')} onClick={() => setAbc(!abc)} aria-label={abc ? 'Números' : 'Letras'}>
            {abc ? '123' : 'ABC'}
          </button>
        ) : (
          <span />
        )}
        {!abc ? (
          <button type="button" className="key" onClick={() => press('0')} aria-label="0">
            0
          </button>
        ) : null}
        <button type="button" className={cn('key', abc && '!h-11 col-span-2')} onClick={() => onChange(value.slice(0, -1))} aria-label="Apagar">
          ⌫
        </button>
      </div>
    </div>
  );
}
