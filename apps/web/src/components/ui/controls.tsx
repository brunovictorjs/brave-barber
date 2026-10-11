'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { cn } from '@/lib/utils';

/** Interruptor (shadcn Switch com o visual .toggle do protótipo). */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root className={cn('toggle', className)} {...props}>
      <SwitchPrimitive.Thumb asChild>
        <i />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}

/** Caixa de seleção (shadcn Checkbox com o visual .chk). */
export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root className={cn('chk', className)} {...props}>
      <svg aria-hidden="true">
        <use href="#check" />
      </svg>
    </CheckboxPrimitive.Root>
  );
}

/** Abas segmentadas (Serviços | Produtos, Próximos | Histórico…). */
export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('segs', className)} {...props} />;
}

export function TabsTrigger(props: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger {...props} />;
}

/** Grupo de chips de escolha única. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: React.ReactNode; count?: number | string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('scrollx', className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          className={cn('chip', value === o.value && 'on')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined ? <b>{o.count}</b> : null}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, error, children, className, hint }: { label: string; error?: string; children: React.ReactNode; className?: string; hint?: React.ReactNode }) {
  return (
    <label className={cn('field', className)}>
      <span>{label}</span>
      {children}
      {hint ? <small className="xs muted">{hint}</small> : null}
      {error ? <small className="err">{error}</small> : null}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn('input', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn('input area', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('animate-pulse rounded-[4px] bg-[#1a1a1a]', className)} style={style} />;
}
