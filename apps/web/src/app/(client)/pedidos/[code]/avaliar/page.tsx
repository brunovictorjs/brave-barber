'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, Photo } from '@/components/brand/brand';
import { RequireAuth } from '@/components/client/auth-guard';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Skeleton, Textarea } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { dateKey, parts, monthShort } from '@/lib/format';
import type { Avatar as AvatarData } from '@/lib/types';

const WORDS = ['', 'Ruim', 'Fraco', 'Ok', 'Bom', 'Excelente'];

interface Prepared {
  code: string;
  completedAt: string | null;
  hasService: boolean;
  serviceLabel: string;
  icon: string;
  barber: { name: string; headline: string; avatar: AvatarData } | null;
  products: { productId: string; name: string; icon: string; reviewed: boolean }[];
  serviceReviewed: boolean;
  alreadyReviewed: boolean;
  canReview: boolean;
}

function StarRow({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="stars big w-full justify-center" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={i === value}
          aria-label={`${i} ${i === 1 ? 'estrela' : 'estrelas'}`}
          onClick={() => onChange(i)}
          className="cursor-pointer border-0 bg-transparent p-0 text-[#f2f2f2] transition-transform active:scale-90"
        >
          <svg aria-hidden="true" style={{ width: 32, height: 32 }}>
            <use href={i <= value ? '#star' : '#staro'} />
          </svg>
        </button>
      ))}
    </div>
  );
}

function ReviewForm({ code }: { code: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['review-prepare', code], queryFn: () => api.get<Prepared>(`/me/orders/${code}/review`) });
  const [service, setService] = useState(5);
  const [barber, setBarber] = useState(5);
  const [text, setText] = useState('');
  const [productStars, setProductStars] = useState<Record<string, number>>({});
  const openProducts = data?.products.filter((p) => !p.reviewed) ?? [];
  const reviewService = !!data?.hasService && !data.serviceReviewed;

  const send = useMutation({
    mutationFn: () =>
      api.post(`/me/orders/${code}/review`, {
        ...(reviewService ? { serviceRating: service, barberRating: barber, text: text.trim() || null } : {}),
        products: openProducts.map((p) => ({ productId: p.productId, rating: productStars[p.productId] ?? 5, text: null })),
      }),
    onSuccess: () => {
      toast.success('Obrigado pela avaliação!');
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
      void qc.invalidateQueries({ queryKey: ['my-order', code] });
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['product'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
      router.replace('/pedidos?aba=historico');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const when = data?.completedAt ? parts(data.completedAt) : null;

  return (
    <>
      <Body>
        <TopNav title="Como foi?" back={`/pedidos/${code}`} />
        {!data ? (
          <Skeleton className="h-64" />
        ) : data.alreadyReviewed ? (
          <p className="m muted">Você já avaliou este pedido. Obrigado!</p>
        ) : (
          <Reveal>
            <section className="card raised mb-1 flex items-center gap-[11px]">
              <Photo icon={data.icon} iconSize="md" className="h-[46px] w-[46px] flex-[0_0_46px]" />
              <div>
                <div className="s b">{data.serviceLabel || openProducts.map((p) => p.name).join(' + ')}</div>
                <div className="xs muted mt-[3px]">
                  {when ? `${when.day} ${monthShort(when.month - 1)}` : dateKey()} · {data.code}
                </div>
              </div>
            </section>
            {reviewService ? (
              <>
                <h2 className="sec">O serviço</h2>
                <section className="card center">
                  <StarRow value={service} onChange={setService} label="Nota do serviço" />
                  <div className="s b mt-2.5">{WORDS[service]}</div>
                </section>
              </>
            ) : null}
            {reviewService && data.barber ? (
              <>
                <h2 className="sec">Quem atendeu</h2>
                <section className="card">
                  <div className="rowx mb-3">
                    <Avatar data={data.barber.avatar} size={38} />
                    <div>
                      <div className="s b">{data.barber.name}</div>
                      <div className="xs muted">{data.barber.headline}</div>
                    </div>
                  </div>
                  <StarRow value={barber} onChange={setBarber} label="Nota do profissional" />
                  <div className="s b center mt-2.5">{WORDS[barber]}</div>
                </section>
              </>
            ) : null}
            {openProducts.length ? (
              <>
                <h2 className="sec">{openProducts.length === 1 ? 'O produto' : 'Os produtos'}</h2>
                <div className="stack">
                  {openProducts.map((p) => {
                    const v = productStars[p.productId] ?? 5;
                    return (
                      <section className="card" key={p.productId}>
                        <div className="rowx mb-3">
                          <Photo icon={p.icon} iconSize="s" className="h-[34px] w-[34px] flex-[0_0_34px]" />
                          <div className="s b">{p.name}</div>
                          <span className="sp" />
                          <span className="xs b">{WORDS[v]}</span>
                        </div>
                        <StarRow value={v} onChange={(n) => setProductStars((m) => ({ ...m, [p.productId]: n }))} label={`Nota de ${p.name}`} />
                      </section>
                    );
                  })}
                </div>
              </>
            ) : null}
            {reviewService ? (
              <>
                <label className="field mt-[18px]">
                  <span>Conta pra gente (opcional)</span>
                  <Textarea rows={4} className="min-h-24" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="O que você achou do atendimento?" />
                </label>
                <p className="xs muted mt-2 leading-relaxed">Avaliações com nota, texto e serviço preenchidos podem aparecer na página inicial.</p>
              </>
            ) : null}
          </Reveal>
        )}
      </Body>
      {data?.canReview ? (
        <Foot>
          <Button onClick={() => send.mutate()} loading={send.isPending}>
            Enviar avaliação
          </Button>
        </Foot>
      ) : null}
    </>
  );
}

export default function ReviewPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <Screen>
      <RequireAuth>{() => <ReviewForm code={code.toUpperCase()} />}</RequireAuth>
    </Screen>
  );
}
