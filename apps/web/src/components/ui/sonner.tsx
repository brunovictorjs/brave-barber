'use client';

import { Toaster as Sonner } from 'sonner';

/** Avisos rápidos ("Pedido criado", "Código não confere") no visual Noite. */
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      toastOptions={{
        style: {
          background: '#1e1e1e',
          border: '1px solid #9a9a9a',
          color: '#f2f2f2',
          borderRadius: 4,
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
        },
      }}
    />
  );
}
