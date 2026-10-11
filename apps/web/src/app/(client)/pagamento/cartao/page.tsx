'use client';

import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/brand/icon';
import { RequireAuth } from '@/components/client/auth-guard';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { money } from '@/lib/format';
import { useCart } from '@/lib/queries';
import type { CheckoutOptions, CheckoutResult, Me } from '@/lib/types';

const PUBLISHABLE = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = () => (stripePromise ??= PUBLISHABLE ? loadStripe(PUBLISHABLE) : Promise.resolve(null));

const fmtNumber = (v: string) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
const fmtExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};
const brand = (n: string) => (/^4/.test(n) ? 'VISA' : /^(5[1-5]|2[2-7])/.test(n) ? 'MASTERCARD' : /^3[47]/.test(n) ? 'AMEX' : /^(636368|438935|504175|4576|4011|5067)/.test(n) ? 'ELO' : 'CARTÃO');

/** Cartão aço-escovado do protótipo, preenchido ao vivo. */
function CardPreview({ number, name, expiry }: { number: string; name: string; expiry: string }) {
  return (
    <div
      aria-hidden="true"
      className="mb-[18px] rounded-[12px] border border-[#d4d4d4] p-[18px] text-[#0a0a0a]"
      style={{ background: 'repeating-linear-gradient(90deg, rgba(255,255,255,.18) 0 1px, transparent 1px 3px), linear-gradient(160deg, #ffffff, #b8b8b8 40%, #8c8c8c 62%, #d4d4d4)' }}
    >
      <div className="rowx mb-[26px]">
        <span className="block h-[26px] w-9 rounded-[4px] border border-[#5a5a5a]" style={{ background: 'linear-gradient(135deg, #f2f2f2, #8c8c8c)' }} />
        <span className="sp" />
        <span className="b text-[13px] tracking-[.14em]">{brand(number.replace(/\s/g, ''))}</span>
      </div>
      <div className="code text-[18px]">{number || '•••• •••• •••• ••••'}</div>
      <div className="rowx mt-4">
        <div>
          <div className="xs text-[#2e2e2e]">Titular</div>
          <div className="s b">{name || 'SEU NOME'}</div>
        </div>
        <span className="sp" />
        <div>
          <div className="xs text-[#2e2e2e]">Validade</div>
          <div className="s code">{expiry || 'MM/AA'}</div>
        </div>
      </div>
    </div>
  );
}

function CardForm({ me }: { me: Me }) {
  const params = useSearchParams();
  const method = params.get('metodo') === 'DEBIT' ? 'DEBIT' : 'CREDIT';
  const router = useRouter();
  const qc = useQueryClient();
  const { data: cart } = useCart();
  const { data: options } = useQuery({ queryKey: ['checkout-options', cart?.totalCents], queryFn: () => api.get<CheckoutOptions>('/checkout/options') });
  const stripe = useStripe();
  const elements = useElements();
  const useStripeForm = options?.gateway === 'STRIPE' && !!PUBLISHABLE;

  const [number, setNumber] = useState(useStripeForm ? '' : '4242 4242 4242 4242');
  const [name, setName] = useState(me.name.toUpperCase());
  const [expiry, setExpiry] = useState('12/29');
  const [cvc, setCvc] = useState('');
  const [installments, setInstallments] = useState(1);
  // Cartão recusado: o pedido já saiu do carrinho; a nova tentativa usa o mesmo pedido.
  const [pending, setPending] = useState<{ code: string; amountCents: number } | null>(null);
  const total = pending?.amountCents ?? cart?.totalCents ?? 0;

  const pay = useMutation({
    mutationFn: async () => {
      const body = { method, installments: method === 'CREDIT' ? installments : 1 };
      const result = pending ? await api.post<CheckoutResult>(`/me/orders/${pending.code}/payment`, body) : await api.post<CheckoutResult>('/checkout', body);
      if (result.kind !== 'card') throw new Error('Resposta inesperada do pagamento.');
      setPending({ code: result.code, amountCents: result.amountCents });
      if (result.gateway === 'STRIPE') {
        if (!stripe || !elements || !result.clientSecret) throw new Error('O Stripe não carregou. Recarregue a página.');
        const card = elements.getElement(CardElement);
        const confirmation = await stripe.confirmCardPayment(result.clientSecret, {
          payment_method: { card: card!, billing_details: { name, email: me.email } },
        });
        if (confirmation.error) throw new Error(confirmation.error.message ?? 'Pagamento recusado.');
        await api.post(`/me/orders/${result.code}/verify`);
      } else {
        await api.post(`/me/orders/${result.code}/test-card`, { number, name, expiry, cvc });
      }
      return result.code;
    },
    onSuccess: (code) => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
      router.replace(`/pedidos/${code}?novo=1`);
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      toast.error(errorMessage(e));
    },
  });

  const valid = useStripeForm ? !!name : number.replace(/\s/g, '').length >= 13 && name.length > 1 && /^\d{2}\/\d{2}$/.test(expiry);

  return (
    <>
      <Body>
        <TopNav title={method === 'CREDIT' ? 'Cartão de crédito' : 'Cartão de débito'} back="/pagamento" />
        <Reveal>
          <CardPreview number={useStripeForm ? '' : number} name={name} expiry={useStripeForm ? '' : expiry} />
          <div className="stack gap-3.5">
            {useStripeForm ? (
              <div className="field">
                <span>Dados do cartão</span>
                <div className="input !py-4">
                  <div className="flex-1">
                    <CardElement
                      options={{
                        hidePostalCode: true,
                        style: { base: { color: '#f2f2f2', fontFamily: 'Montserrat, Arial, sans-serif', fontSize: '15px', '::placeholder': { color: '#6e6e6e' } }, invalid: { color: '#ffffff' } },
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <Field label="Número do cartão">
                  <div className="input">
                    <Icon name="card" size="s" />
                    <input value={number} inputMode="numeric" autoComplete="cc-number" onChange={(e) => setNumber(fmtNumber(e.target.value))} aria-label="Número do cartão" />
                  </div>
                </Field>
              </>
            )}
            <Field label="Nome como está no cartão">
              <Input value={name} autoComplete="cc-name" onChange={(e) => setName(e.target.value.toUpperCase())} />
            </Field>
            {!useStripeForm ? (
              <div className="g2">
                <Field label="Validade">
                  <Input value={expiry} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" onChange={(e) => setExpiry(fmtExpiry(e.target.value))} />
                </Field>
                <Field label="CVV">
                  <Input value={cvc} inputMode="numeric" autoComplete="cc-csc" placeholder="000" maxLength={4} onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))} />
                </Field>
              </div>
            ) : null}
            {method === 'CREDIT' && options && options.installmentOptions.length > 1 ? (
              <Field label="Parcelas">
                <select className="input appearance-none" value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                  {options.installmentOptions.map((o) => (
                    <option key={o.count} value={o.count}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
          <p className="rowx xs muted mt-4 justify-center gap-2">
            <Icon name="lock" size="s" />
            Dados tratados pelo Stripe. Não guardamos seu cartão.
          </p>
          {!useStripeForm ? (
            <p className="xs muted center mt-2">Modo de teste: qualquer cartão válido é aprovado; 4000 0000 0000 0002 é recusado.</p>
          ) : null}
        </Reveal>
      </Body>
      <Foot>
        <Button onClick={() => pay.mutate()} loading={pay.isPending} disabled={!valid || (!pending && !cart?.items.length)}>
          Pagar {money(total)}
        </Button>
      </Foot>
    </>
  );
}

function CardScreen() {
  const stripe = useMemo(() => getStripe(), []);
  return (
    <Elements stripe={stripe} options={{ locale: 'pt-BR' }}>
      <RequireAuth>{(me) => <CardForm me={me} />}</RequireAuth>
    </Elements>
  );
}

export default function CardPage() {
  return (
    <Screen>
      <Suspense>
        <CardScreen />
      </Suspense>
    </Screen>
  );
}
