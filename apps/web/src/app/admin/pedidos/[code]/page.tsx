'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { use, useState } from 'react';
import { toast } from 'sonner';
import { DeliverDialog, PaymentDialog } from '@/components/admin/counter-dialogs';
import { AdminHeader, useStaffMe } from '@/components/admin/shell';
import { Avatar, StatusBadge } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { compactDateTime, duration, hm, money2, monthShort, parts } from '@/lib/format';
import type { OrderView } from '@/lib/types';

interface AdminOrder extends OrderView {
  finance: { feesCents: number; commissionCents: number; netCents: number; commissionLines: { label: string; amountCents: number }[] };
  customerStats: { since: string | null; orders: number; lateCount: number } | null;
  refund: { allowed: boolean; outsideWindow: boolean; manualAllowed: boolean; amountCents: number };
}

/** Pedido no admin (tela 36) + ações de balcão (baixa e entrega). */
export default function AdminOrderPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const me = useStaffMe();
  const qc = useQueryClient();
  const isAdmin = me.roles.includes('ADMIN');
  const { data: o } = useQuery({ queryKey: ['admin-order', code], queryFn: () => api.get<AdminOrder>(`/admin/orders/${code}`), refetchInterval: 20_000 });
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [paying, setPaying] = useState(false);
  const [delivering, setDelivering] = useState(false);

  const refund = useMutation({
    mutationFn: () => api.post<AdminOrder>(`/admin/orders/${code}/refund`),
    onSuccess: (updated) => {
      qc.setQueryData(['admin-order', code], updated);
      setConfirmRefund(false);
      toast.success('Estorno registrado');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const receipt = useMutation({
    mutationFn: () => api.post(`/admin/orders/${code}/receipt`),
    onSuccess: () => toast.success('Comprovante reenviado ao cliente'),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!o) {
    return (
      <>
        <AdminHeader url={`/pedidos/${code}`} title={code} back="/admin/pedidos" />
        <main className="acontent">
          <Skeleton className="h-96" />
        </main>
      </>
    );
  }

  const since = o.customerStats?.since ? parts(o.customerStats.since) : null;
  const canRefund = o.refund.allowed && (!o.refund.outsideWindow || (o.refund.manualAllowed && isAdmin));
  // Mesma regra do domínio: pedido cancelado (ou ainda sem confirmação) não tem o que entregar.
  const canDeliver = !['CART', 'PENDING_PAYMENT', 'CANCELLED'].includes(o.status);
  const pendingProducts = canDeliver ? o.items.filter((i) => i.kind === 'PRODUCT' && !i.deliveredAt) : [];

  return (
    <>
      <AdminHeader
        url={`/pedidos/${o.code}`}
        title={<span className="code">{o.code}</span>}
        back="/admin/pedidos"
        badge={<StatusBadge status={o.displayStatus} label={o.displayStatus === 'LATE' ? 'Pago · atrasada' : o.displayLabel} />}
      >
        {o.customer.email ? (
          <Button variant="dark" size="sm" onClick={() => receipt.mutate()} loading={receipt.isPending}>
            <Icon name="receipt" size="s" />
            Reenviar comprovante
          </Button>
        ) : null}
        {canRefund ? (
          <Button variant="danger" size="sm" onClick={() => setConfirmRefund(true)}>
            <Icon name="refund" size="s" />
            Estornar
          </Button>
        ) : null}
      </AdminHeader>
      <main className="acontent cols">
          <div style={{ flex: '1.5 1 420px' }} className="min-w-0">
            <section className="card mb-3.5">
              <h2 className="s b mb-3.5 mt-0">Itens do pedido</h2>
              <div className="tbl">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Categoria</th>
                      <th className="r">Duração</th>
                      <th className="r">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.items.map((i) => (
                      <tr key={i.id}>
                        <td>
                          {i.name}
                          {i.quantity > 1 ? ` × ${i.quantity}` : ''}
                          {i.addedDuringService ? <span className="xs muted"> · extra</span> : null}
                          {i.kind === 'PRODUCT' ? <span className="xs muted"> · {i.deliveredAt ? 'entregue' : o.status === 'CANCELLED' ? 'não entregue' : 'a entregar'}</span> : null}
                        </td>
                        <td>{i.categoryName}</td>
                        <td className="r">{i.kind === 'SERVICE' ? duration(i.durationMin) : '—'}</td>
                        <td className="r">{money2(i.unitPriceCents * i.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divider" />
              <div className="rowx m mb-2">
                <span className="muted">Subtotal</span>
                <span className="sp" />
                <span className="num">{money2(o.subtotalCents)}</span>
              </div>
              {o.discountCents ? (
                <div className="rowx m mb-2">
                  <span className="muted">Desconto combo</span>
                  <span className="sp" />
                  <span className="num">{money2(-o.discountCents)}</span>
                </div>
              ) : null}
              {o.finance.feesCents ? (
                <div className="rowx m mb-2">
                  <span className="muted">Taxa Stripe</span>
                  <span className="sp" />
                  <span className="num">{money2(-o.finance.feesCents)}</span>
                </div>
              ) : null}
              {o.finance.commissionLines.map((l) => (
                <div className="rowx m mb-2" key={l.label}>
                  <span className="muted">{l.label}</span>
                  <span className="sp" />
                  <span className="num">{money2(-l.amountCents)}</span>
                </div>
              ))}
              {o.refundedCents ? (
                <div className="rowx m mb-2">
                  <span className="muted">Estornado</span>
                  <span className="sp" />
                  <span className="num">{money2(-o.refundedCents)}</span>
                </div>
              ) : null}
              <div className="divider" />
              <div className="rowx">
                <span className="b">{o.status === 'COMPLETED' ? 'Líquido para a casa' : 'Líquido previsto'}</span>
                <span className="sp" />
                <span className="price text-[18px]">{money2(o.finance.netCents)}</span>
              </div>
            </section>
            <section className="card">
              <h2 className="s b mb-4 mt-0">Linha do tempo</h2>
              <div className="tl2">
                {o.timeline.map((t, i) => (
                  <div key={i} className={`step ${i === o.timeline.length - 1 && !['COMPLETED', 'CANCELLED'].includes(o.status) ? 'now' : 'done'}`}>
                    <div className="s b">{t.description}</div>
                    <div className="xs muted">
                      {compactDateTime(t.createdAt)}
                      {t.actorName ? ` · ${t.actorName}` : ''}
                    </div>
                  </div>
                ))}
                {o.late ? (
                  <div className="step">
                    <div className="s b muted">Aguardando o cliente</div>
                    <div className="xs muted">{o.late.fitInAt ? `encaixe sugerido às ${hm(o.late.fitInAt)}` : `atrasado ${o.late.minutes} min`}</div>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        <div style={{ flex: '1 1 280px' }} className="min-w-0">
          <section className="card mb-3.5">
            <div className="rowx mb-3.5">
              <Avatar data={o.customer.avatar} size={40} />
              <div>
                <div className="b">{o.customer.name}</div>
                <div className="xs muted">{o.customer.email ?? (o.origin === 'WALK_IN' ? 'cliente de balcão' : '')}</div>
              </div>
            </div>
            <div className="rowx m mb-2">
              <span className="muted">Telefone</span>
              <span className="sp" />
              <span>{o.customer.phone ?? '—'}</span>
            </div>
            {o.customerStats ? (
              <>
                <div className="rowx m mb-2">
                  <span className="muted">Cliente desde</span>
                  <span className="sp" />
                  <span>{since ? `${monthShort(since.month - 1)}/${since.year}` : '—'}</span>
                </div>
                <div className="rowx m mb-2">
                  <span className="muted">Pedidos</span>
                  <span className="sp" />
                  <span>{o.customerStats.orders}</span>
                </div>
                <div className="rowx m">
                  <span className="muted">Atrasos</span>
                  <span className="sp" />
                  <span className={o.customerStats.lateCount ? 'badge warn' : ''}>{o.customerStats.lateCount}</span>
                </div>
              </>
            ) : null}
            {o.barber ? (
              <>
                <div className="divider" />
                <div className="rowx m">
                  <span className="muted">Profissional</span>
                  <span className="sp" />
                  <span>{o.barber.name}</span>
                </div>
              </>
            ) : null}
          </section>

          {o.amountDueCents > 0 || pendingProducts.length ? (
            <section className="card raised mb-3.5" style={{ borderColor: '#f2f2f2' }}>
              <h2 className="s b mb-3 mt-0">Balcão</h2>
              {o.amountDueCents > 0 ? (
                <div className="rowx m mb-3">
                  <span className="muted">A receber</span>
                  <span className="sp" />
                  <span className="price">{money2(o.amountDueCents)}</span>
                </div>
              ) : null}
              <div className="stack">
                {o.amountDueCents > 0 ? (
                  <Button size="sm" className="w-full" onClick={() => setPaying(true)}>
                    Dar baixa no pagamento
                  </Button>
                ) : null}
                {pendingProducts.length && o.amountDueCents === 0 ? (
                  <Button variant="dark" size="sm" className="w-full" onClick={() => setDelivering(true)}>
                    Entregar produtos
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}

          {o.type === 'APPOINTMENT' && o.origin === 'SITE' ? (
            <section className="card mb-3.5">
              <h2 className="s b mb-3 mt-0">Códigos</h2>
              <div className="rowx m mb-[9px]">
                <span className="muted">Do pedido</span>
                <span className="sp" />
                <span className="code">{o.code}</span>
              </div>
              <div className="rowx m">
                <span className="muted">De conclusão</span>
                <span className="sp" />
                <span className="code muted">{o.completionCode ?? '—'}</span>
              </div>
              <p className="xs muted mt-2.5 leading-relaxed">O código de conclusão só fica visível para o cliente; aqui aparece para suporte.</p>
            </section>
          ) : null}

          {o.payments.length ? (
            <section className="card mb-3.5">
              <h2 className="s b mb-3 mt-0">Pagamentos</h2>
              {o.payments.map((p) => (
                <div key={p.id} className="mb-2.5">
                  <div className="rowx m">
                    <span>
                      {p.methodLabel}
                      {p.installments > 1 ? ` ${p.installments}x` : ''}
                    </span>
                    <span className="sp" />
                    <span className="num">{money2(p.amountCents)}</span>
                  </div>
                  <div className="xs muted">
                    {p.channel === 'ONLINE' ? `Stripe ${p.providerRef ?? ''}` : `balcão · ${p.recordedByName ?? ''}`}
                    {p.changeCents ? ` · troco ${money2(p.changeCents)}` : ''}
                    {p.status === 'REFUNDED' ? ' · estornado' : p.status === 'FAILED' ? ' · recusado' : ''}
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {o.refund.allowed && o.refund.outsideWindow ? (
            <section className="card note">
              <h2 className="s b mb-2 mt-0">Estorno manual</h2>
              <p className="xs muted mb-3 leading-relaxed">
                {o.refund.manualAllowed
                  ? `O prazo automático venceu às ${o.cancel.deadline ? hm(o.cancel.deadline) : ''}. Um estorno agora é decisão da casa e fica registrado com o seu nome.`
                  : 'O estorno fora do prazo está desligado em Configurações › Pagamento.'}
              </p>
              {canRefund ? (
                <Button variant="danger" size="sm" className="w-full" onClick={() => setConfirmRefund(true)}>
                  Estornar {money2(o.refund.amountCents)}
                </Button>
              ) : null}
            </section>
          ) : null}
        </div>
      </main>

      <Dialog open={confirmRefund} onOpenChange={setConfirmRefund}>
        <DialogContent showClose={false}>
          <DialogTitle className="disp m-0 text-[20px]">Estornar {money2(o.refund.amountCents)}?</DialogTitle>
          <DialogDescription className="m muted mb-5 mt-3">
            O pedido {o.code} será cancelado e o valor volta para o cliente pelo Stripe. {o.refund.outsideWindow ? 'Este estorno está fora do prazo e fica registrado com o seu nome.' : ''}
          </DialogDescription>
          <div className="stack">
            <Button variant="danger" onClick={() => refund.mutate()} loading={refund.isPending}>
              Sim, estornar
            </Button>
            <Button variant="ghost" onClick={() => setConfirmRefund(false)}>
              Voltar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <PaymentDialog order={o} open={paying} onOpenChange={setPaying} />
      <DeliverDialog order={o} open={delivering} onOpenChange={setDelivering} />
    </>
  );
}
