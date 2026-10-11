'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { CodePad } from '@/components/staff/code-pad';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { hm, money } from '@/lib/format';
import type { OrderView } from '@/lib/types';

function services(o: OrderView) {
  return o.items
    .filter((i) => i.kind === 'SERVICE')
    .map((i) => i.name)
    .join(' + ');
}

/** Conferir o código do pedido e iniciar (tela 27). Avulso começa direto, sem código. */
function CheckCode() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const walkInId = params.get('pedido');
  const [code, setCode] = useState('');

  const { data: walkIn } = useQuery({ queryKey: ['staff-order', walkInId], queryFn: () => api.get<OrderView>(`/staff/orders/${walkInId}`), enabled: !!walkInId });
  const { data: lookup } = useQuery({
    queryKey: ['lookup', code],
    queryFn: () => api.get<{ matches: OrderView[] }>('/staff/orders/lookup', { code }),
    enabled: !walkInId && code.length >= 3,
  });

  const match = lookup?.matches.find((m) => m.code === `BRV-${code}`) ?? (code.length >= 3 ? lookup?.matches[0] : undefined);
  const done = !!match && match.code === `BRV-${code}`;

  const start = useMutation({
    mutationFn: () => api.post<OrderView>('/staff/orders/start', walkInId ? { orderId: walkInId } : { code: `BRV-${code}` }),
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: ['staff-agenda'] });
      router.replace(`/barbeiro/atendimento/${o.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (walkInId) {
    return (
      <>
        <Body>
          <TopNav title="Pedido avulso" back="/barbeiro" />
          {walkIn ? (
            <Reveal>
              <p className="m muted mb-5">Pedido criado no balcão. Avulso começa sem conferir código.</p>
              <section className="card raised mb-[18px] flex items-center gap-3">
                <Avatar data={walkIn.customer.avatar} size={42} />
                <div className="flex-1">
                  <div className="b lg">{walkIn.customer.name}</div>
                  <div className="xs muted mt-[3px]">
                    {services(walkIn)} · {money(walkIn.totalCents)}
                  </div>
                </div>
                <span className="badge n">Avulso</span>
              </section>
            </Reveal>
          ) : null}
        </Body>
        <Foot>
          <Button onClick={() => start.mutate()} loading={start.isPending} disabled={!walkIn}>
            Iniciar atendimento
          </Button>
          <p className="xs muted center mt-2.5">O cronômetro começa no momento em que você confirma.</p>
        </Foot>
      </>
    );
  }

  return (
    <>
      <Body>
        <TopNav title="Conferir código" back="/barbeiro" />
        <p className="m muted mb-[22px]">Peça ao cliente o código do pedido e digite abaixo.</p>
        <CodePad prefix="BRV-" length={5} value={code} onChange={setCode} />
        <div className="mt-5">
          {match ? (
            <section className="card raised mb-[18px] flex items-center gap-3">
              <Avatar data={match.customer.avatar} size={42} />
              <div className="flex-1">
                <div className="b lg">{match.customer.name}</div>
                <div className="xs muted mt-[3px]">
                  {services(match)} · {hm(match.scheduledStart!)} · {money(match.totalCents)}
                </div>
              </div>
              {done ? <Icon name="check" /> : null}
            </section>
          ) : code.length >= 3 && lookup ? (
            <div className="card note center mb-[18px]">
              <span className="xs muted">Nenhum pedido de hoje começa com esse código.</span>
            </div>
          ) : null}
        </div>
      </Body>
      <Foot>
        <Button onClick={() => start.mutate()} loading={start.isPending} disabled={!done}>
          Iniciar atendimento
        </Button>
        <p className="xs muted center mt-2.5">O cronômetro começa no momento em que você confirma.</p>
      </Foot>
    </>
  );
}

export default function CheckCodePage() {
  return (
    <Screen>
      <Suspense>
        <CheckCode />
      </Suspense>
    </Screen>
  );
}
