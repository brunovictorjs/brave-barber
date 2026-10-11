'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Note } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Field, Input, Skeleton } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { duration, maskPhone, matchText, money } from '@/lib/format';
import { useMe } from '@/lib/session';
import type { OrderView, SellableCatalog } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Novo pedido avulso pelo barbeiro (tela 26b): começa na hora, sem código. */
export default function WalkInPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: catalog } = useQuery({ queryKey: ['staff-catalog'], queryFn: () => api.get<SellableCatalog>('/staff/catalog') });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [q, setQ] = useState('');
  const [svc, setSvc] = useState<string[]>([]);
  const [prd, setPrd] = useState<string[]>([]);

  const services = (catalog?.services ?? []).filter((s) => !me || s.barberIds.includes(me.id));
  const products = catalog?.products ?? [];
  const svcTotal = services.filter((s) => svc.includes(s.id)).reduce((a, s) => a + s.priceCents, 0);
  const prdTotal = products.filter((p) => prd.includes(p.id)).reduce((a, p) => a + p.priceCents, 0);
  const mins = services.filter((s) => svc.includes(s.id)).reduce((a, s) => a + s.durationMin, 0);
  const flip = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const create = useMutation({
    mutationFn: () => api.post<OrderView>('/staff/walk-ins', { customerName: name, customerPhone: phone || null, serviceIds: svc, productIds: prd }),
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: ['staff-agenda'] });
      toast.success(`Pedido ${o.code} criado · cronômetro rodando`);
      router.replace(`/barbeiro/atendimento/${o.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const Row = ({ id, title, sub, price, on, onClick }: { id: string; title: string; sub: string; price: number; on: boolean; onClick: () => void }) => (
    <button key={id} type="button" role="checkbox" aria-checked={on} className={cn('card flex w-full cursor-pointer items-center gap-3 text-left text-[var(--ink)]', on && 'sel')} onClick={onClick}>
      <span className={cn('chk', on && 'on')}>
        <svg aria-hidden="true">
          <use href="#check" />
        </svg>
      </span>
      <span className="flex-1">
        <span className="s b block">{title}</span>
        <span className="xs muted mt-0.5 block">{sub}</span>
      </span>
      <span className="price">{money(price)}</span>
    </button>
  );

  return (
    <Screen>
      <Body>
        <TopNav title="Pedido avulso" back="/barbeiro" />
        <Reveal>
          <p className="m muted mb-[18px] leading-[1.55]">Cliente chegou sem agendamento? Monte o pedido aqui e comece na hora.</p>
          <div className="stack mb-1.5 gap-3">
            <Field label="Nome do cliente">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome e sobrenome" autoFocus />
            </Field>
            <Field label="Celular (opcional)">
              <Input value={phone} inputMode="tel" onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(81) 9 0000-0000" />
            </Field>
          </div>
          <label className="input mt-[18px]">
            <Icon name="search" size="s" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar serviço ou produto…" aria-label="Buscar serviço ou produto" />
          </label>
          <h2 className="sec">Serviços</h2>
          <div className="stack" role="group" aria-label="Serviços">
            {!catalog ? <Skeleton className="h-40" /> : null}
            {services.filter((s) => svc.includes(s.id) || matchText(s.name, q)).map((s) => (
              <Row key={s.id} id={s.id} title={s.name} sub={`${s.durationMin} min`} price={s.priceCents} on={svc.includes(s.id)} onClick={() => flip(svc, setSvc, s.id)} />
            ))}
          </div>
          <h2 className="sec">
            Produtos <span className="muted font-medium normal-case tracking-normal">· opcional</span>
          </h2>
          <div className="stack" role="group" aria-label="Produtos">
            {products.filter((p) => prd.includes(p.id) || matchText(p.name, q)).map((p) => (
              <Row key={p.id} id={p.id} title={p.name} sub={`produto · ${p.detail}`} price={p.priceCents} on={prd.includes(p.id)} onClick={() => flip(prd, setPrd, p.id)} />
            ))}
          </div>
          <section className="card raised mt-[18px]">
            <div className="rowx m mb-2">
              <span className="muted">Serviços</span>
              <span className="sp" />
              <span className="num">{money(svcTotal)}</span>
            </div>
            <div className="rowx m mb-2">
              <span className="muted">Produtos</span>
              <span className="sp" />
              <span className="num">{money(prdTotal)}</span>
            </div>
            <div className="divider my-2.5" />
            <div className="rowx">
              <span className="b">Total</span>
              <span className="sp" />
              <span className="price text-[22px]">{money(svcTotal + prdTotal)}</span>
            </div>
            <div className="rowx xs muted mt-2 gap-1.5">
              <Icon name="clock" size="s" />
              {duration(mins)} de cadeira · produtos não contam no tempo
            </div>
          </section>
          <Note icon="shield" dashed className="mt-3.5">
            Como foi você que criou o pedido, ele começa sem conferir código e termina sem código de conclusão.
          </Note>
        </Reveal>
      </Body>
      <Foot>
        <Button onClick={() => create.mutate()} loading={create.isPending} disabled={name.trim().length < 2 || svc.length === 0}>
          Criar e começar · {money(svcTotal + prdTotal)}
        </Button>
      </Foot>
    </Screen>
  );
}
