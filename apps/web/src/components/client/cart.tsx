'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useState } from 'react';
import { Photo } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { duration, money, plural } from '@/lib/format';
import { useCart, useCartActions } from '@/lib/queries';
import { useMe } from '@/lib/session';
import { useLoginRedirect } from './auth-guard';

const CartContext = createContext<{ open: () => void }>({ open: () => undefined });

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <CartContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <CartSheet open={open} onOpenChange={setOpen} />
    </CartContext.Provider>
  );
}

export const useCartSheet = () => useContext(CartContext);

/** Adicionar ao carrinho exige login; depois de adicionar, abre a gaveta. */
export function useAddToCart() {
  const { data: me } = useMe();
  const login = useLoginRedirect();
  const { add } = useCartActions();
  const sheet = useCartSheet();
  return {
    pending: add.isPending,
    add: (item: { serviceId?: string; productId?: string }, opts: { openSheet?: boolean } = {}) => {
      if (!me) return login();
      add.mutate(item, { onSuccess: () => opts.openSheet !== false && sheet.open() });
    },
  };
}

export function CartButton() {
  const { data: me } = useMe();
  const { data: cart } = useCart(!!me);
  const sheet = useCartSheet();
  const login = useLoginRedirect();
  const n = cart?.count ?? 0;
  return (
    <button type="button" className="ibtn" aria-label={`Carrinho, ${plural(n, 'item', 'itens')}`} onClick={() => (me ? sheet.open() : login())}>
      <Icon name="cart" />
      {n > 0 ? <span className="dot-n">{n}</span> : null}
    </button>
  );
}

/** Gaveta do carrinho (tela 11 do protótipo). */
function CartSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: cart } = useCart(!!me && open);
  const { add, remove } = useCartActions();
  const items = cart?.items ?? [];
  const suggestion = cart?.suggestion;
  const suggestionInCart = suggestion && items.some((i) => i.refId === suggestion.id);
  const hasServices = items.some((i) => i.kind === 'SERVICE');

  const next = () => {
    onOpenChange(false);
    router.push(hasServices ? '/agendar/dia' : '/pagamento');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby="cart-desc">
        <div className="rowx mb-4">
          <SheetTitle className="disp m-0 text-[20px]">Carrinho</SheetTitle>
          <span className="chip sm">{plural(cart?.count ?? 0, 'item', 'itens')}</span>
          <span className="sp" />
          <SheetClose className="ibtn !h-[34px] !w-[34px]" aria-label="Fechar">
            <Icon name="close" size="s" />
          </SheetClose>
        </div>
        <SheetDescription id="cart-desc" className="sr-only">
          Itens escolhidos e total do pedido
        </SheetDescription>

        {items.length === 0 ? (
          <div className="card note center mb-4 py-8">
            <Icon name="cart" size="l" className="mx-auto mb-2 text-[var(--chrome-mid)]" />
            <div className="s b">Seu carrinho está vazio</div>
            <p className="xs muted mt-1">Escolha um serviço ou produto no catálogo.</p>
          </div>
        ) : (
          <div className="list mb-4">
            {items.map((it) => (
              <div className="li" key={it.id}>
                <Photo icon={it.icon} iconSize="md" className="h-[54px] w-[54px] flex-[0_0_54px]" />
                <div className="flex-1">
                  <div className="s b">
                    {it.name}
                    {it.quantity > 1 ? <span className="muted"> × {it.quantity}</span> : null}
                  </div>
                  <div className="xs muted mt-[3px]">{it.kind === 'SERVICE' ? duration(it.durationMin) : 'Produto · retira no balcão'}</div>
                </div>
                <div className="text-right">
                  <div className="price">{money(it.unitPriceCents * it.quantity)}</div>
                  {it.unitPriceCents < it.listPriceCents ? <div className="xs strike">{money(it.listPriceCents * it.quantity)}</div> : null}
                  <button type="button" onClick={() => remove.mutate(it.id)} className="xs lnk cursor-pointer border-0 bg-transparent pt-1 text-[var(--ink-muted)]">
                    remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {suggestion && hasServices ? (
          <>
            <div className="xs muted mb-2 font-semibold uppercase tracking-[.12em]">Leve junto</div>
            <div className="card mb-3.5 flex items-center gap-[11px] !px-3 !py-2.5">
              <Photo icon={suggestion.icon} iconSize="s" className="h-[42px] w-[42px] flex-[0_0_42px]" />
              <div className="flex-1">
                <div className="s b">{suggestion.name}</div>
                <div className="xs muted mt-0.5">{money(suggestion.priceCents)} · entregue no balcão</div>
              </div>
              <button
                type="button"
                className={suggestionInCart ? 'btn sm primary' : 'btn sm dark'}
                aria-pressed={!!suggestionInCart}
                disabled={add.isPending}
                onClick={() => {
                  if (suggestionInCart) {
                    const line = items.find((i) => i.refId === suggestion.id);
                    if (line) remove.mutate(line.id);
                  } else add.mutate({ productId: suggestion.id });
                }}
              >
                {suggestionInCart ? 'Adicionado' : 'Adicionar'}
              </button>
            </div>
          </>
        ) : null}

        {items.length > 0 ? (
          <div className="card raised mb-3.5">
            <div className="rowx m mb-2">
              <span className="muted">Subtotal</span>
              <span className="sp" />
              <span className="num">{money(cart!.subtotalCents)}</span>
            </div>
            {cart!.combos.map((c) => (
              <div className="rowx m mb-2" key={c.comboName}>
                <span className="muted">Desconto combo</span>
                <span className="sp" />
                <span className="num">{money(-c.discountCents)}</span>
              </div>
            ))}
            <div className="divider my-2.5" />
            <div className="rowx">
              <span className="b">Total</span>
              <span className="sp" />
              <span className="price text-[22px]">{money(cart!.totalCents)}</span>
            </div>
            {hasServices ? (
              <div className="rowx xs muted mt-2 gap-1.5">
                <Icon name="clock" size="s" />
                {duration(cart!.durationMin)} de cadeira no total
              </div>
            ) : null}
          </div>
        ) : null}

        <Button disabled={items.length === 0} onClick={next}>
          {hasServices ? 'Escolher dia e horário' : 'Ir para o pagamento'}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
