'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { RequireAuth } from '@/components/client/auth-guard';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { cap, longDate, money } from '@/lib/format';
import { useCart } from '@/lib/queries';
import type { CheckoutOptions, CheckoutResult } from '@/lib/types';
import { cn } from '@/lib/utils';

type Method = 'PIX' | 'CREDIT' | 'DEBIT' | 'CASH';

function PaymentChoice() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: cart } = useCart();
  const { data: options } = useQuery({ queryKey: ['checkout-options', cart?.totalCents], queryFn: () => api.get<CheckoutOptions>('/checkout/options'), enabled: !!cart?.items.length });
  const [method, setMethod] = useState<Method>('PIX');

  const pay = useMutation({
    mutationFn: (m: Method) => api.post<CheckoutResult>('/checkout', { method: m }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
      if (result.kind === 'pix') {
        qc.setQueryData(['pix', result.code], result);
        router.replace(`/pagamento/pix/${result.code}`);
      } else router.replace(`/pedidos/${result.code}?novo=1`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (cart && !cart.items.length) {
    return (
      <Body>
        <TopNav title="Pagamento" back="/catalogo" />
        <p className="m muted">Seu carrinho está vazio.</p>
      </Body>
    );
  }

  const total = cart?.totalCents ?? 0;
  const s = cart?.schedule;
  const appointment = cart?.type === 'APPOINTMENT';
  const methods: { id: Method; name: string; sub: string; icon: string; cta: string }[] = [
    { id: 'PIX', name: 'Pix', sub: 'Confirma na hora', icon: 'pix', cta: `Pagar ${money(total)} com Pix` },
    { id: 'CREDIT', name: 'Cartão de crédito', sub: options && options.maxInstallments > 1 ? `Em até ${options.maxInstallments}x sem juros` : 'À vista', icon: 'card', cta: 'Continuar no cartão' },
    { id: 'DEBIT', name: 'Cartão de débito', sub: 'Débito à vista', icon: 'card', cta: 'Continuar no débito' },
    { id: 'CASH', name: 'Dinheiro', sub: appointment ? 'Pague na barbearia, no balcão' : 'Pague na retirada, no balcão', icon: 'money', cta: appointment ? 'Agendar e pagar no balcão' : 'Reservar e pagar na retirada' },
  ];
  const available = methods.filter((m) => options?.methods[m.id] ?? true);
  const current = available.find((m) => m.id === method) ?? available[0];

  const go = () => {
    if (!current) return;
    if (current.id === 'CREDIT' || current.id === 'DEBIT') router.push(`/pagamento/cartao?metodo=${current.id}`);
    else pay.mutate(current.id);
  };

  return (
    <>
      <Body>
        <TopNav title="Pagamento" back={appointment ? true : '/catalogo'} />
        {!cart ? (
          <Skeleton className="h-48" />
        ) : (
          <Reveal>
            <section className="card raised mb-1">
              {appointment && s ? (
                <>
                  <div className="rowx mb-1">
                    {s.barber ? <Avatar data={s.barber.avatar} size={34} /> : null}
                    <div>
                      <div className="s b">
                        {cap(longDate(s.date))} · {s.time}
                      </div>
                      <div className="xs muted mt-0.5">
                        {s.barber?.name ?? 'Qualquer profissional'} · termina {s.endTime}
                      </div>
                    </div>
                    <span className="sp" />
                    <Link className="xs lnk" href="/agendar/dia">
                      trocar
                    </Link>
                  </div>
                  <div className="divider" />
                </>
              ) : !appointment ? (
                <>
                  <div className="rowx mb-1 gap-2.5">
                    <Icon name="bag" />
                    <div className="s b">Retirada no balcão</div>
                  </div>
                  <div className="divider" />
                </>
              ) : null}
              {cart.items.map((i) => (
                <div className="rowx m mb-[7px]" key={i.id}>
                  <span className="muted">
                    {i.name}
                    {i.quantity > 1 ? ` × ${i.quantity}` : ''}
                  </span>
                  <span className="sp" />
                  <span className="num">{money(i.unitPriceCents * i.quantity)}</span>
                </div>
              ))}
              {cart.combos.map((c) => (
                <div className="rowx m" key={c.comboName}>
                  <span className="muted">Desconto combo</span>
                  <span className="sp" />
                  <span className="num">{money(-c.discountCents)}</span>
                </div>
              ))}
              <div className="divider" />
              <div className="rowx">
                <span className="b">Total</span>
                <span className="sp" />
                <span className="price text-[22px]">{money(total)}</span>
              </div>
            </section>
            {appointment && !s ? (
              <div className="card note mt-3 flex items-center gap-2.5">
                <Icon name="alert" />
                <p className="xs muted flex-1">Escolha o dia e o horário antes de pagar.</p>
                <Link className="btn sm dark" href="/agendar/dia">
                  Escolher
                </Link>
              </div>
            ) : null}

            <h2 className="sec">Como você quer pagar</h2>
            <div className="stack" role="radiogroup" aria-label="Forma de pagamento">
              {available.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={current?.id === m.id}
                  className={cn('card flex w-full cursor-pointer items-center gap-3 text-left text-[var(--ink)]', current?.id === m.id && 'sel')}
                  onClick={() => setMethod(m.id)}
                >
                  <Icon name={m.icon} size="l" />
                  <span className="flex-1">
                    <span className="s b block">{m.name}</span>
                    <span className="xs muted mt-0.5 block">{m.sub}</span>
                  </span>
                  <span className={cn('radio', current?.id === m.id && 'on')} />
                </button>
              ))}
            </div>
            {current?.id === 'CASH' ? (
              <div className="card mt-4 flex items-start gap-2.5">
                <Icon name="money" />
                <p className="xs muted leading-relaxed">
                  {appointment ? (
                    <>
                      Seu horário fica reservado agora e você paga <b className="text-[var(--ink)]">{money(total)} no balcão</b>, depois do atendimento.
                      {s ? ` Se não puder ir, cancele pelo app até ${s.time} de ${longDate(s.date).split(',')[0]}.` : ''}
                    </>
                  ) : (
                    <>
                      Você paga <b className="text-[var(--ink)]">{money(total)} no balcão</b> quando for retirar.
                    </>
                  )}
                </p>
              </div>
            ) : (
              <div className="card mt-4 flex items-start gap-2.5">
                <Icon name="shield" />
                <p className="xs muted leading-relaxed">
                  Pagamento processado pelo Stripe.
                  {appointment && s ? (
                    <>
                      {' '}
                      Cancele até <b className="text-[var(--ink)]">{s.time} de {longDate(s.date).split(',')[0]}</b> e o valor volta inteiro para você.
                    </>
                  ) : null}
                </p>
              </div>
            )}
            <p className="xs muted center mt-4">
              Ao confirmar você concorda com os{' '}
              <Link className="lnk text-[var(--ink)]" href="/termos">
                Termos de serviço
              </Link>
              .
            </p>
          </Reveal>
        )}
      </Body>
      <Foot>
        <Button onClick={go} loading={pay.isPending} disabled={!cart || !current || (appointment && !s)}>
          {current?.cta ?? 'Continuar'}
        </Button>
      </Foot>
    </>
  );
}

export default function PaymentPage() {
  return (
    <Screen>
      <RequireAuth>{() => <PaymentChoice />}</RequireAuth>
    </Screen>
  );
}

