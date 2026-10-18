'use client';

import Link from 'next/link';
import { Avatar } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { RequireAuth } from '@/components/client/auth-guard';
import { Body, ClientTabBar, Screen } from '@/components/client/shell';
import { CountUp, Reveal } from '@/components/motion/motion';
import { useLogout } from '@/lib/session';

const fmt = (n: number) => String(n);

export default function ProfilePage() {
  const logout = useLogout();
  return (
    <Screen size="medium">
      <RequireAuth>
        {(me) => (
          <Body>
            <div className="topnav">
              <h1 className="ttl">Perfil</h1>
              {me.roles.some((r) => r !== 'CLIENT') ? (
                <Link className="btn sm dark" href={me.roles.includes('ADMIN') ? '/admin' : me.roles.includes('RECEPTIONIST') ? '/admin/balcao' : '/barbeiro'}>
                  Área da equipe
                </Link>
              ) : null}
            </div>
            <Reveal>
              <section className="card raised mb-[18px] flex items-center gap-[13px]">
                <Avatar data={me.avatar} size={54} className="shrink-0 !text-[17px]" />
                <div className="min-w-0 flex-1">
                  <div className="b lg truncate">{me.name}</div>
                  <div className="xs muted mt-[3px] truncate" title={me.email}>{me.email}</div>
                </div>
                <Link className="btn sm dark shrink-0" href="/perfil/identidade">
                  Editar
                </Link>
              </section>
              <div className="g3 mb-5">
                <Link className="card center !px-1.5 !py-[13px]" href="/pedidos?aba=historico">
                  <CountUp className="price block text-[20px]" value={me.stats.completed} format={fmt} />
                  <div className="xs muted">atendimentos</div>
                </Link>
                <Link className="card center !px-1.5 !py-[13px]" href="/favoritos">
                  <CountUp className="price block text-[20px]" value={me.stats.favorites} format={fmt} />
                  <div className="xs muted">favoritos</div>
                </Link>
                <div className="card center !px-1.5 !py-[13px]">
                  <CountUp className="price block text-[20px]" value={me.stats.reviews} format={fmt} />
                  <div className="xs muted">avaliações</div>
                </div>
              </div>
              <nav className="card list !px-3.5 !py-0.5" aria-label="Conta">
                <Link className="li" href="/pedidos">
                  <Icon name="cal" />
                  <span className="s b flex-1">Meus pedidos</span>
                  <Icon name="chev" size="s" className="muted" />
                </Link>
                <Link className="li" href="/favoritos">
                  <Icon name="heart" />
                  <span className="s b flex-1">Favoritos</span>
                  <Icon name="chev" size="s" className="muted" />
                </Link>
                <Link className="li" href="/perfil/sobre">
                  <Icon name="edit" />
                  <span className="flex-1">
                    <span className="s b block">Sobre você</span>
                    <span className="xs muted">Texto de apresentação</span>
                  </span>
                  <Icon name="chev" size="s" className="muted" />
                </Link>
              </nav>
              <nav className="card list mt-3 !px-3.5 !py-0.5" aria-label="Políticas">
                <Link className="li" href="/termos">
                  <Icon name="doc" />
                  <span className="s flex-1">Termos de serviço</span>
                  <Icon name="chev" size="s" className="muted" />
                </Link>
                <Link className="li" href="/privacidade">
                  <Icon name="shield" />
                  <span className="s flex-1">Política de privacidade</span>
                  <Icon name="chev" size="s" className="muted" />
                </Link>
              </nav>
              <button type="button" onClick={logout} className="rowx xs b mx-auto mb-1.5 mt-5 cursor-pointer justify-center gap-1.5 border-0 bg-transparent text-[var(--ink)]">
                <Icon name="logout" size="s" />
                Sair da conta
              </button>
              <p className="xs muted center">Brave Barber · versão 1.0.0</p>
            </Reveal>
          </Body>
        )}
      </RequireAuth>
      <ClientTabBar />
    </Screen>
  );
}
