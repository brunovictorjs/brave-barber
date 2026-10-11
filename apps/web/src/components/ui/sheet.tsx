'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

/**
 * Folha que sobe de baixo (carrinho, adicionar item, concluir) — no celular
 * ocupa a largura da tela; no desktop fica presa à coluna de 480px do app.
 * `side="left"` vira o menu lateral do painel em telas pequenas.
 */
export function SheetContent({
  className,
  children,
  side = 'bottom',
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: 'bottom' | 'left' }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/72 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 outline-none',
          side === 'bottom'
            ? 'sheet-panel inset-x-0 bottom-0 mx-auto max-h-[92dvh] w-full max-w-[480px] overflow-y-auto data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:duration-300'
            : 'inset-y-0 left-0 w-[260px] overflow-y-auto border-r border-[var(--line)] bg-[#0e0e0e] p-3 data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left',
          className,
        )}
        {...props}
      >
        {side === 'bottom' ? <div className="grab" /> : null}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
