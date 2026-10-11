'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/brand/icon';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

function Overlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn('fixed inset-0 z-50 bg-black/72 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0', className)}
      {...props}
    />
  );
}

/** Modal centralizado (cancelamento, dar baixa, novo avulso…). */
export function DialogContent({ className, children, wide, showClose = true, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { wide?: boolean; showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'modal-panel fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto outline-none',
          wide ? 'max-w-[560px]' : 'max-w-[420px]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close className="ibtn absolute right-4 top-4 !h-[34px] !w-[34px]" aria-label="Fechar">
            <Icon name="close" size="s" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Confirmação curta antes de uma ação que não dá para desfazer. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Voltar',
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="!max-w-[380px]">
        <DialogPrimitive.Title className="disp mb-2 text-[19px]">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="m muted mb-5 leading-relaxed">{description}</DialogPrimitive.Description>
        <div className="rowx gap-2.5">
          <DialogPrimitive.Close className="btn dark sm !h-11 flex-1">{cancelLabel}</DialogPrimitive.Close>
          <button type="button" className="btn primary sm !h-11 flex-1" onClick={onConfirm} disabled={loading} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </DialogPrimitive.Root>
  );
}
