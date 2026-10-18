'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/brand/brand';
import { ShopLogo } from '@/components/brand/shop-brand';
import { Icon } from '@/components/brand/icon';
import { Screen } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { api, errorMessage } from '@/lib/api';
import { homeFor } from '@/lib/session';
import type { Avatar as AvatarData, Me } from '@/lib/types';

interface Providers {
  google: boolean;
  googleClientId: string | null;
  dev: boolean;
}

interface DevUser {
  id: string;
  name: string;
  email: string;
  label: string;
  avatar: AvatarData;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (opts: {
            client_id: string;
            scope: string;
            ux_mode: 'popup';
            callback: (r: { code?: string; error?: string }) => void;
            error_callback?: (e: { type: string }) => void;
          }) => { requestCode: () => void };
        };
      };
    };
  }
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 20, height: 20 }}>
      <path fill="#1f1f1f" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#5a5a5a" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="#8c8c8c" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z" />
      <path fill="#3a3a3a" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" />
    </svg>
  );
}

function LoginScreen() {
  const params = useSearchParams();
  const googleClient = useRef<{ requestCode: () => void } | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: providers } = useQuery({ queryKey: ['auth-providers'], queryFn: () => api.get<Providers>('/auth/providers') });
  const { data: devUsers } = useQuery({ queryKey: ['dev-users'], queryFn: () => api.get<DevUser[]>('/auth/dev-users'), enabled: !!providers?.dev });

  const afterLogin = useCallback(async () => {
    const me = await api.get<Me>('/auth/me');
    // Entrar implica aceitar a versão vigente dos termos e da privacidade.
    if (me.pendingLegal.length) await api.post('/me/legal/accept');
    const next = params.get('next');
    // Navegação completa: o cache do router guardou, de quando a pessoa era visitante, o
    // redirecionamento do middleware para /entrar nas áreas protegidas (ex.: /perfil).
    window.location.replace(!me.onboarded ? `/perfil/identidade${next ? `?next=${encodeURIComponent(next)}` : ''}` : next && next.startsWith('/') ? next : homeFor(me));
  }, [params]);

  // Popup do Google com o nosso próprio botão: o Google devolve um código que a API troca pelo ID token.
  const initGoogle = useCallback(() => {
    if (!providers?.googleClientId || !window.google) return;
    googleClient.current = window.google.accounts.oauth2.initCodeClient({
      client_id: providers.googleClientId,
      scope: 'openid email profile',
      ux_mode: 'popup',
      callback: async ({ code, error }) => {
        if (!code) {
          if (error !== 'access_denied') toast.error('Não foi possível entrar com o Google. Tente de novo.');
          return;
        }
        setBusy(true);
        try {
          await api.post('/auth/google', { code });
          await afterLogin();
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      },
      error_callback: ({ type }) => {
        if (type === 'popup_failed_to_open') toast.error('O navegador bloqueou a janela do Google. Libere os pop-ups deste site.');
      },
    });
  }, [providers, afterLogin]);

  const googleLogin = () => {
    if (googleClient.current) googleClient.current.requestCode();
    else if (providers?.google) toast.error('O Google ainda está carregando. Tente de novo em instantes.');
    else if (providers?.dev) setDevOpen(true);
    else toast.error('O login com Google ainda não foi configurado.');
  };

  useEffect(() => {
    if (providers?.google && window.google) initGoogle();
  }, [providers, initGoogle]);

  const devLogin = async (userId: string) => {
    setBusy(true);
    try {
      await api.post('/auth/dev', { userId });
      setDevOpen(false);
      await afterLogin();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen className="min-h-[100dvh] justify-end">
      {providers?.google ? <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initGoogle} /> : null}
      <div className="photo absolute inset-0 !rounded-none" style={{ placeItems: 'start center', paddingTop: 70 }}>
        <ShopLogo width={330} height={220} priority />
      </div>
      <Reveal className="relative z-[3] mt-auto px-[22px] pb-[30px] pt-7" stagger={0.08}>
        <div className="absolute inset-0 -z-[1]" style={{ background: 'linear-gradient(rgba(10,10,10,0), rgba(10,10,10,.9) 24%, #0a0a0a 58%)' }} />
        <div className="bb-tagline mb-3.5 text-[12px] tracking-[.3em]">Brave Barber • Gaibu</div>
        <h1 className="disp m-0 text-[36px] leading-[.98]">
          Sua cadeira
          <br />
          te espera
        </h1>
        <p className="m muted mb-[26px] mt-3">Corte, barba e coloração com hora marcada. Escolhe o serviço, escolhe o horário, paga e aparece.</p>
        <div>
          <button
            type="button"
            className="btn mb-2.5 !border-white !bg-white text-[15px] !normal-case !tracking-[.02em] !text-[#1f1f1f]"
            onClick={googleLogin}
            disabled={busy}
            aria-busy={busy}
          >
            <GoogleMark />
            {busy ? 'Entrando…' : 'Entrar com Google'}
          </button>
          {providers?.google && providers.dev ? (
            <button type="button" className="btn ghost sm mb-2.5 w-full" onClick={() => setDevOpen(true)}>
              Entrar como (desenvolvimento)
            </button>
          ) : null}
        </div>
        <p className="xs muted center">
          Ao entrar você aceita os{' '}
          <Link className="lnk text-[var(--ink)]" href="/termos">
            Termos de serviço
          </Link>{' '}
          e a{' '}
          <Link className="lnk text-[var(--ink)]" href="/privacidade">
            Política de privacidade
          </Link>
          .
        </p>
      </Reveal>

      <Sheet open={devOpen} onOpenChange={setDevOpen}>
        <SheetContent>
          <SheetTitle className="disp mb-1 text-[20px]">Entrar como</SheetTitle>
          <SheetDescription className="xs muted mb-4">
            Modo de desenvolvimento: o Google ainda não está configurado, então escolha um usuário do seed. Desligue com DEV_LOGIN=false.
          </SheetDescription>
          <div className="list">
            {(devUsers ?? []).map((u) => (
              <button key={u.id} type="button" disabled={busy} onClick={() => devLogin(u.id)} className="li w-full cursor-pointer border-x-0 border-t-0 bg-transparent text-left text-[var(--ink)]">
                <Avatar data={u.avatar} size={38} />
                <span className="flex-1">
                  <span className="s b block">{u.name}</span>
                  <span className="xs muted block">
                    {u.label} · {u.email}
                  </span>
                </span>
                <Icon name="chev" size="s" className="text-[var(--ink-muted)]" />
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </Screen>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
