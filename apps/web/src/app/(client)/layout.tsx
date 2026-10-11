import { CartProvider } from '@/components/client/cart';

/** Área do cliente: app mobile-first numa coluna de até 480px. */
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="shell">{children}</div>
    </CartProvider>
  );
}
