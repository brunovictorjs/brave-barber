'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Note } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { RequireAuth } from '@/components/client/auth-guard';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { Pulse, Reveal, Stamp } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { hm, money } from '@/lib/format';
import { useMyOrder } from '@/lib/queries';

function PixScreen({ code }: { code: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: order } = useMyOrder(code, { refetchInterval: 5000 });
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Pagou (webhook ou verificação): vai para a confirmação.
  useEffect(() => {
    if (order && order.status !== 'PENDING_PAYMENT') router.replace(`/pedidos/${code}?novo=1`);
  }, [order, code, router]);

  const verify = useMutation({
    mutationFn: () => api.post<{ status: string }>(`/me/orders/${code}/verify`),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['my-order', code] });
      if (r.status === 'PENDING_PAYMENT') toast('Ainda não recebemos o Pix. Confira no app do banco e tente de novo.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const retry = useMutation({
    mutationFn: () => api.post(`/me/orders/${code}/payment`, { method: 'PIX' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-order', code] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const pix = order?.pendingPayment;
  const expiresAt = pix?.expiresAt ? new Date(pix.expiresAt).getTime() : order?.holdExpiresAt ? new Date(order.holdExpiresAt).getTime() : 0;
  const left = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const expired = order && expiresAt > 0 && left === 0;

  const copy = async () => {
    if (!pix?.pixCode) return;
    await navigator.clipboard.writeText(pix.pixCode).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <>
      <Body className="center">
        <TopNav title="Pague com Pix" back="/pagamento" />
        {!order ? (
          <Skeleton className="mx-auto h-[208px] w-[208px]" />
        ) : (
          <Reveal>
            <div>
              {expired ? (
                <span className="badge bad dot mb-[18px]">Código expirado</span>
              ) : (
                <Pulse active={left < 120}>
                  <span className="badge warn dot mb-[18px]" aria-live="polite">
                    Expira em {String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
                  </span>
                </Pulse>
              )}
            </div>
            <Stamp className="mx-auto mb-[18px] h-[208px] w-[208px] rounded-[12px] bg-white p-3.5 text-[#0a0a0a]">
              {pix?.pixCode ? <QRCodeSVG value={pix.pixCode} size={180} level="M" bgColor="#ffffff" fgColor="#0a0a0a" role="img" aria-label="QR Code do Pix" /> : <Skeleton className="h-full w-full !bg-[#ddd]" />}
            </Stamp>
            <p className="m muted mb-4">Abra o app do seu banco, escolha Pix por QR Code e aponte a câmera.</p>
            <div className="input mb-2.5 justify-between">
              <span className="s muted overflow-hidden text-ellipsis whitespace-nowrap tracking-[.04em]">{pix?.pixCode ? `${pix.pixCode.slice(0, 26)}…` : '—'}</span>
              <button type="button" onClick={copy} className="xs b lnk rowx cursor-pointer gap-1.5 border-0 bg-transparent p-0 text-[var(--ink)]">
                <Icon name={copied ? 'check' : 'copy'} size="s" />
                {copied ? 'copiado' : 'copiar'}
              </button>
            </div>
            <div className="s b mb-1 mt-3">{money(order.totalCents)}</div>
            <Note icon="clock" className="mt-3.5 text-left">
              {order.scheduledStart
                ? `Seu horário das ${hm(order.scheduledStart)} fica reservado enquanto o código estiver válido. Se expirar, ele volta para a agenda.`
                : 'Sua compra fica reservada enquanto o código estiver válido.'}
            </Note>
          </Reveal>
        )}
      </Body>
      <Foot>
        {expired ? (
          <Button onClick={() => retry.mutate()} loading={retry.isPending}>
            Gerar novo código
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => verify.mutate()} loading={verify.isPending}>
            Já paguei, verificar
          </Button>
        )}
      </Foot>
    </>
  );
}

export default function PixPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <Screen>
      <RequireAuth>{() => <PixScreen code={code} />}</RequireAuth>
    </Screen>
  );
}
