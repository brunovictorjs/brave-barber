'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, Note, StatusBadge } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { RequireAuth } from '@/components/client/auth-guard';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { ChromeText, Pulse, Reveal, Stamp } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { clock, duration, hm, longDate, longDateTime, money, shortDateTime } from '@/lib/format';
import { useMyOrder } from '@/lib/queries';
import type { OrderView } from '@/lib/types';

function SummaryRows({ o }: { o: OrderView }) {
  const services = o.items.filter((i) => i.kind === 'SERVICE');
  return (
    <section className="card text-left">
      {o.type === 'APPOINTMENT' ? (
        <>
          <div className="rowx m mb-2">
            <span className="muted">Serviços</span>
            <span className="sp" />
            <span className="text-right">{services.map((s) => s.name).join(' + ')}</span>
          </div>
          <div className="rowx m mb-2">
            <span className="muted">Duração</span>
            <span className="sp" />
            <span>{duration(o.durationMin)}</span>
          </div>
        </>
      ) : (
        <>
          {o.items.map((i) => (
            <div className="rowx m mb-2" key={i.id}>
              <span className="muted">
                {i.name}
                {i.quantity > 1 ? ` × ${i.quantity}` : ''}
              </span>
              <span className="sp" />
              <span className="num">{money(i.totalCents)}</span>
            </div>
          ))}
          <div className="divider my-2.5" />
        </>
      )}
      {o.amountDueCents > 0 ? (
        <>
          <div className="rowx m mb-2">
            <span className="muted">Pagamento</span>
            <span className="sp" />
            <span>Dinheiro, no balcão</span>
          </div>
          <div className="rowx m mb-2">
            <span className="muted">Situação</span>
            <span className="sp" />
            <span className="badge info dot">Aguardando pagamento</span>
          </div>
          <div className="rowx m">
            <span className="muted">A pagar</span>
            <span className="sp" />
            <span className="price">{money(o.amountDueCents)}</span>
          </div>
        </>
      ) : (
        <>
          <div className="rowx m mb-2">
            <span className="muted">Pago com</span>
            <span className="sp" />
            <span>{o.payments.filter((p) => p.status === 'SUCCEEDED').map((p) => p.methodLabel + (p.installments > 1 ? ` ${p.installments}x` : '')).join(' + ') || o.paymentChoiceLabel}</span>
          </div>
          <div className="rowx m">
            <span className="muted">Total</span>
            <span className="sp" />
            <span className="price">{money(o.totalCents)}</span>
          </div>
        </>
      )}
    </section>
  );
}

/** Confirmação logo depois do checkout (telas 18, 18b e 18c). */
function Confirmation({ o, email }: { o: OrderView; email: string }) {
  const router = useRouter();
  const pickup = o.type === 'PICKUP';
  const cash = o.amountDueCents > 0;
  const icon = pickup ? 'bag' : cash ? 'calok' : 'check';
  const kicker = pickup ? (cash ? 'Compra reservada' : 'Compra paga') : cash ? 'Horário' : 'Pedido';
  const title = pickup ? 'Retire no balcão' : cash ? 'Reservado' : 'Pago';
  return (
    <>
      <Body className="center">
        <Reveal>
          <div className="mt-10">
            <Stamp className={`mx-auto mb-[18px] grid h-[76px] w-[76px] place-items-center rounded-full ${cash && !pickup ? 'border-2 border-[#f2f2f2] text-[#f2f2f2]' : 'bg-[#f2f2f2] text-[#0a0a0a]'}`}>
              <svg aria-hidden="true" style={{ width: 36, height: 36 }}>
                <use href={`#${icon}`} />
              </svg>
            </Stamp>
            <div className="kick text-[14px] tracking-[.14em]">{kicker}</div>
            <ChromeText as="h1" className="disp m-0 leading-none" style={{ fontSize: pickup ? 46 : cash ? 50 : 56 }}>
              {title}
            </ChromeText>
            <p className="m muted mt-2.5">
              {pickup ? (
                <>
                  Av. Laura Cavalcante – Gaibu
                  <br />
                  no horário de funcionamento
                </>
              ) : (
                <>
                  {o.scheduledStart ? longDateTime(o.scheduledStart).replace(/^./, (c) => c.toUpperCase()) : ''}
                  <br />
                  com {o.barber?.name ?? 'a equipe'}
                </>
              )}
            </p>
          </div>
          <section className="card raised mb-4 mt-[26px] border-2 !border-[#f2f2f2] !p-[17px]">
            <div className="xs muted mb-[9px]">{pickup ? 'Mostre este código à balconista' : 'Mostre este código na chegada'}</div>
            <div className="code text-[32px]">{o.code}</div>
            <div className="divider" />
            <p className="xs muted leading-relaxed">
              {pickup ? 'Ela digita o código, entrega os produtos e o pedido passa a Concluído.' : 'O barbeiro digita esse código para confirmar que é você e começar o atendimento.'}
            </p>
          </section>
          <SummaryRows o={o} />
          {cash && !pickup ? (
            <Note icon="money" dashed className="mt-3.5 text-left">
              Você paga a balconista depois do atendimento. Quando o barbeiro digitar o seu código de conclusão, o pedido passa a <b className="text-[var(--ink)]">Pago</b>.
            </Note>
          ) : !cash ? (
            <p className="xs muted mt-4">Enviamos o comprovante para {email}</p>
          ) : null}
        </Reveal>
      </Body>
      <Foot className="flex gap-2.5">
        {pickup ? (
          <Button asChild>
            <Link href="/pedidos">Ver meus pedidos</Link>
          </Button>
        ) : (
          <Button onClick={() => router.replace(`/pedidos/${o.code}`)}>Ver pedido</Button>
        )}
      </Foot>
    </>
  );
}

/** Em atendimento: cronômetro e código de conclusão (tela 21). */
function LiveService({ o }: { o: OrderView }) {
  const [elapsed, setElapsed] = useState(o.elapsedSeconds);
  useEffect(() => setElapsed(o.elapsedSeconds), [o.elapsedSeconds]);
  useEffect(() => {
    if (o.paused) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [o.paused]);
  const pct = Math.min(100, Math.round((elapsed / Math.max(1, o.durationMin * 60)) * 100));
  const services = o.items.filter((i) => i.kind === 'SERVICE');
  const current = services.find((s) => !s.doneAt);
  return (
    <Body>
      <TopNav title="Seu atendimento" back="/pedidos" right={<Pulse active={!o.paused}><span className={o.paused ? 'badge n dot' : 'badge warn dot'}>{o.paused ? 'Pausado' : 'Ao vivo'}</span></Pulse>} />
      <Reveal>
        <section className="card raised mb-3.5 flex items-center gap-3">
          {o.barber ? <Avatar data={o.barber.avatar} size={42} /> : null}
          <div className="flex-1">
            <div className="b lg">{o.barber?.name}</div>
            <div className="xs muted mt-[3px]">
              começou às {o.startedAt ? hm(o.startedAt) : '—'}
              {o.barber?.chair ? ` · ${o.barber.chair}` : ''}
            </div>
          </div>
          <div className="text-right">
            <div className="xs muted">Decorrido</div>
            <div className="code text-[17px]">{clock(elapsed)}</div>
          </div>
        </section>
        <div className="prog mb-[22px]" role="progressbar" aria-label="Andamento do pacote" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <section className="card raised center border-2 !border-[#f2f2f2] !p-[17px]">
          <div className="xs muted">Código de conclusão</div>
          <ChromeText as="div" className="code mb-1 mt-3 text-[48px] leading-[1.05]">
            {o.completionCode}
          </ChromeText>
          <div className="divider" />
          <p className="m">Quando {o.barber?.firstName ?? 'o barbeiro'} terminar, vai pedir este código. Só com ele o pedido é fechado como concluído.</p>
        </section>
        <Note icon="alert" dashed className="mt-3">
          Não mostre o código antes do serviço acabar. Ele é a sua garantia de que nada é fechado pela metade.
        </Note>
        <h2 className="sec">Pacote em execução</h2>
        <div className="stack">
          {services.map((s) => (
            <div key={s.id} className={`card flex items-center gap-[11px] ${current?.id === s.id ? 'sel' : ''}`}>
              {s.doneAt ? (
                <span className="grid h-6 w-6 flex-[0_0_24px] place-items-center rounded-full bg-[#f2f2f2] text-[#0a0a0a]">
                  <Icon name="check" size="s" className="!h-3.5 !w-3.5" />
                </span>
              ) : (
                <span className="h-6 w-6 flex-[0_0_24px] rounded-full border-2 border-[#f2f2f2]" />
              )}
              <div className="flex-1">
                <div className="s b">{s.name}</div>
                <div className="xs muted mt-0.5">{s.doneAt ? `concluído às ${hm(s.doneAt)}` : `${current?.id === s.id ? 'em andamento' : 'na sequência'} · ${duration(s.durationMin)} estimados`}</div>
              </div>
            </div>
          ))}
          {o.items
            .filter((i) => i.kind === 'PRODUCT')
            .map((p) => (
              <div key={p.id} className="card flex items-center gap-[11px]">
                <span className="grid h-6 w-6 flex-[0_0_24px] place-items-center">
                  <Icon name="bag" size="s" />
                </span>
                <div className="flex-1">
                  <div className="s b">{p.name}</div>
                  <div className="xs muted mt-0.5">Produto · a balconista entrega</div>
                </div>
                <span className="s b num">{money(p.totalCents)}</span>
              </div>
            ))}
        </div>
        <div className="rowx xs muted mt-[18px] justify-center gap-[7px]">
          <span className="code">{o.code}</span>
          <span>·</span>
          <span>{o.amountDueCents > 0 ? `${money(o.amountDueCents)} a pagar no balcão` : `${money(o.paidCents)} pagos${o.payments[0] ? ` no ${o.payments[0].methodLabel}` : ''}`}</span>
        </div>
      </Reveal>
    </Body>
  );
}

/** Atrasado: sem reembolso, com encaixe estimado (tela 23). */
function LateOrder({ o }: { o: OrderView }) {
  return (
    <>
      <Body>
        <TopNav title="Pedido" back="/pedidos" />
        <Reveal>
          <section className="card raised center mb-4 !border-[#f2f2f2]">
            <span className="badge warn dot">Pago · atrasado</span>
            <div className="code mt-3.5 text-[30px]">{o.code}</div>
            <div className="xs muted mt-2">
              Era hoje às {o.scheduledStart ? hm(o.scheduledStart) : ''} · agora são {hm(new Date())}
            </div>
          </section>
          <section className="card note mb-1">
            <div className="rowx items-start gap-2.5">
              <Icon name="alert" />
              <div>
                <div className="s b mb-1.5">Seu horário já passou</div>
                <p className="xs muted leading-[1.65]">
                  O reembolso valia até as {o.cancel.deadline ? hm(o.cancel.deadline) : ''}. Seu pedido continua válido: assim que você chegar, a gente encaixa você na primeira folga entre os agendamentos.
                </p>
              </div>
            </div>
          </section>
          <h2 className="sec">Encaixe estimado</h2>
          <section className="card raised">
            <div className="rowx items-end">
              <div>
                <div className="xs muted">Previsão de atendimento</div>
                <div className="price mt-1 text-[26px]">{o.late?.fitInAt ? hm(o.late.fitInAt) : 'a confirmar'}</div>
              </div>
              <span className="sp" />
              <div className="text-right">
                <div className="xs muted">Sua posição</div>
                <div className="price mt-1 text-[26px]">{o.late?.position ?? 1}º</div>
              </div>
            </div>
            <div className="divider" />
            <p className="xs muted leading-relaxed">Quem chegou no horário tem prioridade. Você entra na próxima janela livre, não no fim do dia.</p>
          </section>
          <Note icon="phone" className="mt-3.5">
            Precisa remarcar? Fale com a recepção pelo (81) 3 3344-8820 — a remarcação depende de disponibilidade.
          </Note>
        </Reveal>
      </Body>
      <Foot>
        <Button variant="ghost" disabled aria-describedby="atraso-motivo">
          Cancelamento indisponível
        </Button>
        <p id="atraso-motivo" className="xs muted center mt-2.5">
          O prazo de reembolso terminou às {o.cancel.deadline ? hm(o.cancel.deadline) : ''}.
        </p>
      </Foot>
    </>
  );
}

/** Pedido em aberto (tela 20) + histórico (concluído/cancelado). */
function OpenOrder({ o }: { o: OrderView }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api.post<OrderView>(`/me/orders/${o.code}/cancel`),
    onSuccess: (updated) => {
      qc.setQueryData(['my-order', o.code], updated);
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
      setConfirm(false);
      toast.success(updated.refundedCents ? `Pedido cancelado · ${money(updated.refundedCents)} estornados` : 'Pedido cancelado');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const finished = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(o.status);
  const steps = buildSteps(o);
  const online = o.onlinePaidCents > 0;

  return (
    <>
      <Body>
        <TopNav title="Pedido" back="/pedidos" />
        <Reveal>
          <section className={`card raised center mb-1 !p-[17px] ${finished ? '' : 'border-2 !border-[#f2f2f2]'}`}>
            <StatusBadge status={o.displayStatus} label={o.displayLabel} />
            <div className="code mt-3 text-[30px]">{o.code}</div>
            <div className="xs muted mt-2">
              {o.type === 'PICKUP'
                ? o.status === 'COMPLETED'
                  ? 'Produtos retirados no balcão'
                  : 'Mostre à balconista para retirar'
                : o.scheduledStart
                  ? `${finished ? '' : 'Mostre na chegada · '}${longDate(o.scheduledStart)} às ${hm(o.scheduledStart)}`
                  : ''}
            </div>
          </section>

          {o.canReview ? (
            <Link href={`/pedidos/${o.code}/avaliar`} className="btn primary mt-3">
              <Icon name="staro" size="s" />
              Avaliar atendimento
            </Link>
          ) : null}

          <h2 className="sec">Andamento</h2>
          <div className="tl2">
            {steps.map((s, i) => (
              <div key={i} className={`step ${s.state}`}>
                <div className={`s b ${s.state === '' ? 'muted' : ''}`}>{s.title}</div>
                <div className="xs muted">{s.sub}</div>
              </div>
            ))}
          </div>

          <h2 className="sec">Itens</h2>
          <section className="card">
            {o.items.map((i) => (
              <div className="rowx m mb-[9px]" key={i.id}>
                <span className="muted">
                  {i.name}
                  {i.kind === 'SERVICE' ? ` · ${duration(i.durationMin)}` : i.quantity > 1 ? ` × ${i.quantity}` : ''}
                  {i.addedDuringService ? ' · extra' : ''}
                </span>
                <span className="sp" />
                <span className="num">{money(i.unitPriceCents * i.quantity)}</span>
              </div>
            ))}
            {o.discountCents ? (
              <div className="rowx m">
                <span className="muted">Desconto combo</span>
                <span className="sp" />
                <span className="num">{money(-o.discountCents)}</span>
              </div>
            ) : null}
            <div className="divider" />
            {o.amountDueCents > 0 && o.paidCents > 0 ? (
              <>
                <div className="rowx m mb-2">
                  <span className="muted">Pago online</span>
                  <span className="sp" />
                  <span className="num">{money(-o.paidCents)}</span>
                </div>
                <div className="rowx">
                  <span className="b">A pagar no balcão</span>
                  <span className="sp" />
                  <span className="price">{money(o.amountDueCents)}</span>
                </div>
              </>
            ) : (
              <div className="rowx">
                <span className="b">{o.amountDueCents > 0 ? 'A pagar no balcão' : o.status === 'CANCELLED' ? 'Total' : 'Pago'}</span>
                <span className="sp" />
                <span className="price">{money(o.amountDueCents || o.totalCents)}</span>
              </div>
            )}
            {o.refundedCents ? <div className="xs muted mt-2">Reembolso de {money(o.refundedCents)} devolvido</div> : null}
          </section>
        </Reveal>
      </Body>
      {o.cancel.allowed ? (
        <Foot>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            <Icon name="refund" size="s" />
            {online ? 'Cancelar e pedir reembolso' : 'Cancelar pedido'}
          </Button>
          {o.cancel.deadline ? <p className="xs muted center mt-2.5">Disponível até {shortDateTime(o.cancel.deadline).toLowerCase()}</p> : null}
        </Foot>
      ) : null}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent showClose={false} role="alertdialog">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-full border border-dashed border-[#f2f2f2]">
            <Icon name="refund" />
          </div>
          <DialogTitle className="disp m-0 text-[20px] leading-[1.1]">Cancelar o pedido {o.code}?</DialogTitle>
          <DialogDescription className="m muted mb-4 mt-3">
            {o.type === 'APPOINTMENT' && o.scheduledStart ? `Seu horário de ${longDate(o.scheduledStart).split(',')[0]} às ${hm(o.scheduledStart)} volta para a agenda` : 'Sua compra é cancelada'}
            {online ? ' e o valor é estornado.' : '.'}
          </DialogDescription>
          {online ? (
            <div className="card raised mb-[18px] !bg-[#161616]">
              <div className="rowx m mb-2">
                <span className="muted">Valor pago</span>
                <span className="sp" />
                <span className="num">{money(o.onlinePaidCents)}</span>
              </div>
              <div className="rowx m mb-2">
                <span className="muted">Taxa de cancelamento</span>
                <span className="sp" />
                <span className="num">R$ 0</span>
              </div>
              <div className="divider my-[9px]" />
              <div className="rowx">
                <span className="b">Você recebe</span>
                <span className="sp" />
                <span className="price text-[18px]">{money(o.onlinePaidCents)}</span>
              </div>
              <p className="xs muted mt-[9px] leading-relaxed">Pix cai em até 1 hora. Cartão pode levar até 2 faturas, conforme o banco.</p>
            </div>
          ) : null}
          <div className="stack">
            <Button variant="danger" onClick={() => cancel.mutate()} loading={cancel.isPending}>
              {online ? 'Sim, cancelar e estornar' : 'Sim, cancelar'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {o.type === 'APPOINTMENT' ? 'Manter meu horário' : 'Manter minha compra'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function buildSteps(o: OrderView) {
  const at = (type: string) => o.timeline.find((t) => t.type === type);
  const when = (iso?: string) => (iso ? shortDateTime(iso).replace(/^[^,]+, /, '').replace(' · ', ', ') : '');
  const paid = at('paid');
  const steps: { title: string; sub: string; state: '' | 'done' | 'now' }[] = [
    { title: 'No carrinho', sub: when(at('cart')?.createdAt ?? o.createdAt), state: 'done' },
  ];
  if (o.paymentChoice === 'CASH') steps.push({ title: 'Reservado · dinheiro no balcão', sub: when(at('reserved_cash')?.createdAt), state: 'done' });
  else steps.push({ title: paid ? paid.description.split(' · ')[0]! : 'Aguardando pagamento', sub: paid ? `${when(paid.createdAt)} · ${money(o.onlinePaidCents)}` : 'confirma em instantes', state: paid ? 'done' : 'now' });

  if (o.status === 'CANCELLED') {
    steps.push({ title: 'Cancelado', sub: `${when(o.cancelledAt ?? undefined)}${o.cancelReason ? ` · ${o.cancelReason}` : ''}`, state: 'done' });
    return steps;
  }
  if (o.type === 'PICKUP') {
    steps.push({ title: o.status === 'COMPLETED' ? 'Retirado no balcão' : 'Pronto para retirar', sub: o.status === 'COMPLETED' ? when(o.completedAt ?? undefined) : 'no horário de funcionamento', state: o.status === 'COMPLETED' ? 'done' : 'now' });
    return steps;
  }
  const started = !!o.startedAt;
  steps.push({ title: 'Aguardando você na barbearia', sub: o.scheduledStart ? `${longDate(o.scheduledStart)} às ${hm(o.scheduledStart)}` : '', state: started ? 'done' : o.status === 'SCHEDULED' ? 'now' : '' });
  steps.push({ title: 'Em atendimento', sub: started ? `começou às ${hm(o.startedAt!)}` : 'o barbeiro inicia com seu código', state: o.status === 'IN_SERVICE' ? 'now' : started ? 'done' : '' });
  steps.push({ title: o.status === 'NO_SHOW' ? 'Falta' : 'Concluído', sub: o.completedAt ? when(o.completedAt) : o.status === 'NO_SHOW' ? 'passou da tolerância de atraso' : 'fechado com o código de conclusão', state: o.status === 'COMPLETED' || o.status === 'NO_SHOW' ? 'done' : '' });
  return steps;
}

function OrderScreen({ code, email }: { code: string; email: string }) {
  const params = useSearchParams();
  const fresh = params.get('novo') === '1';
  const { data: o, error } = useMyOrder(code.toUpperCase(), { refetchInterval: 15_000 });
  const router = useRouter();

  useEffect(() => {
    if (o?.status === 'PENDING_PAYMENT' && o.pendingPayment?.method === 'PIX') router.replace(`/pagamento/pix/${o.code}`);
  }, [o, router]);

  if (error) {
    return (
      <Body>
        <TopNav title="Pedido" back="/pedidos" />
        <p className="m muted">Pedido não encontrado.</p>
      </Body>
    );
  }
  if (!o) {
    return (
      <Body className="pt-6">
        <Skeleton className="mb-3 h-32" />
        <Skeleton className="h-48" />
      </Body>
    );
  }
  if (fresh && ['SCHEDULED', 'PENDING_PAYMENT'].includes(o.status)) return <Confirmation o={o} email={email} />;
  if (o.status === 'IN_SERVICE') return <LiveService o={o} />;
  if (o.displayStatus === 'LATE') return <LateOrder o={o} />;
  return <OpenOrder o={o} />;
}

export default function OrderPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <Screen>
      <Suspense>
        <RequireAuth>{(me) => <OrderScreen code={code} email={me.email} />}</RequireAuth>
      </Suspense>
    </Screen>
  );
}

