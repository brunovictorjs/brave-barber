'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Avatar, Note } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { RequireAuth } from '@/components/client/auth-guard';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import type { Me } from '@/lib/types';

const schema = z.object({
  firstName: z.string().trim().min(2, 'Informe seu nome'),
  lastName: z.string().trim(),
  phone: z
    .string()
    .trim()
    .refine((v) => !v || /^\(?\d{2}\)?\s?9?\s?\d{4}-?\d{4}$/.test(v), 'Use o formato (81) 9 0000-0000'),
});

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 3) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}

function IdentityForm({ me }: { me: Me }) {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const editing = me.onboarded;
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: me.firstName, lastName: me.lastName, phone: me.phone ?? '' },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      const updated = await api.put<Me>('/me/identity', { ...values, phone: values.phone || null });
      qc.setQueryData(['me'], updated);
      const next = params.get('next');
      if (editing) {
        toast.success('Perfil atualizado');
        router.push('/perfil');
      } else router.push(`/perfil/sobre${next ? `?next=${encodeURIComponent(next)}` : ''}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  const upload = async (f: File | undefined) => {
    if (!f) return;
    try {
      await api.upload('/me/avatar', f);
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Foto atualizada');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <form onSubmit={submit} className="contents">
      <Body>
        <TopNav title={editing ? 'Seu perfil' : 'Monte seu perfil'} back={editing ? '/perfil' : undefined} step={editing ? undefined : '1 de 2'} />
        <Reveal>
          <p className="m muted mb-[22px]">É assim que os barbeiros vão te reconhecer quando você chegar.</p>
          <div className="mb-[26px] flex justify-center">
            <div className="relative">
              <Avatar data={me.avatar} size={108} className="!text-[30px]" />
              <button
                type="button"
                className="ibtn absolute -bottom-1 -right-1 !h-9 !w-9 !border-[#f2f2f2] !bg-[#f2f2f2] !text-[#0a0a0a]"
                aria-label="Trocar foto"
                onClick={() => file.current?.click()}
              >
                <Icon name="camera" size="s" />
              </button>
              <input ref={file} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
            </div>
          </div>
          <div className="stack gap-3.5">
            <Field label="Nome" error={form.formState.errors.firstName?.message}>
              <Input autoComplete="given-name" aria-invalid={!!form.formState.errors.firstName} {...form.register('firstName')} />
            </Field>
            <Field label="Sobrenome">
              <Input autoComplete="family-name" {...form.register('lastName')} />
            </Field>
            <div className="field">
              <span>E-mail</span>
              <div className="input opacity-60">
                <Icon name="lock" size="s" />
                {me.email}
                <span className="sp" />
                <span className="xs muted">{me.googleLinked ? 'do Google' : 'da conta'}</span>
              </div>
            </div>
            <Field label="Celular" error={form.formState.errors.phone?.message}>
              <Input
                inputMode="tel"
                autoComplete="tel"
                placeholder="(81) 9 0000-0000"
                aria-invalid={!!form.formState.errors.phone}
                {...form.register('phone', { onChange: (e) => form.setValue('phone', maskPhone(e.target.value)) })}
              />
            </Field>
          </div>
          <Note className="mt-5">Seu celular só é usado para avisar sobre mudanças no seu agendamento.</Note>
        </Reveal>
      </Body>
      <Foot>
        <Button type="submit" loading={form.formState.isSubmitting}>
          {editing ? 'Salvar' : 'Continuar'}
        </Button>
      </Foot>
    </form>
  );
}

export default function IdentityPage() {
  return (
    <Screen>
      <Suspense>
        <RequireAuth>{(me) => <IdentityForm me={me} />}</RequireAuth>
      </Suspense>
    </Screen>
  );
}
