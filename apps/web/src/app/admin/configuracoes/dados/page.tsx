'use client';

import { useRef } from 'react';
import { toast } from 'sonner';
import { SettingsPage, useSettingsSection } from '@/components/admin/settings';
import { Logo } from '@/components/brand/brand';
import { customLogo, DEFAULT_COVER, parseCoordinates, ShopMap } from '@/components/brand/shop-brand';
import { Icon } from '@/components/brand/icon';
import { Field, Input, Textarea } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import type { ShopSettings } from '@/lib/types';

/** Dados da casa (tela 44). */
export default function ShopSettingsPage() {
  const { draft, update, dirty, save, updatedAt, loading } = useSettingsSection<ShopSettings>('shop');
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined, key: 'logoUrl' | 'coverUrl') => {
    if (!file) return;
    try {
      const res = await api.upload<{ url: string }>('/admin/media?folder=brand', file);
      update({ [key]: res.url } as Partial<ShopSettings>);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const field = (key: keyof ShopSettings, label: string, placeholder?: string) => (
    <Field label={label}>
      <Input value={draft?.[key] ?? ''} placeholder={placeholder} onChange={(e) => update({ [key]: e.target.value } as Partial<ShopSettings>)} />
    </Field>
  );

  return (
    <SettingsPage slug="dados" dirty={dirty} updatedAt={updatedAt} onSave={() => draft && save.mutate(draft)} saving={save.isPending} loading={loading}>
      {draft ? (
        <div className="cols">
          <section className="card" style={{ flex: '1.4 1 420px' }}>
            <h2 className="s b mb-4 mt-0">Identificação</h2>
            <div className="stack gap-3">
              <div className="g2">
                {field('tradeName', 'Nome fantasia')}
                {field('legalName', 'Razão social', '[Razão social da empresa]')}
              </div>
              <div className="g2">
                {field('cnpj', 'CNPJ', '00.000.000/0000-00')}
                {field('municipalRegistration', 'Inscrição municipal', '[Inscrição municipal]')}
              </div>
              {field('tagline', 'Frase da capa')}
              <Field label="Sobre a casa">
                <Textarea rows={3} className="min-h-[84px]" value={draft.about} onChange={(e) => update({ about: e.target.value })} />
              </Field>
            </div>
            <div className="divider" />
            <h2 className="s b mb-4 mt-0">Onde fica e como falar</h2>
            <div className="stack gap-3">
              <div className="g2" style={{ gridTemplateColumns: '2fr 1fr' }}>
                {field('address', 'Endereço')}
                {field('zip', 'CEP', '00000-000')}
              </div>
              <div className="g2">
                {field('district', 'Bairro')}
                {field('cityUf', 'Cidade e UF')}
              </div>
              <div className="g2">
                {field('phone', 'Telefone')}
                {field('publicEmail', 'E-mail público')}
              </div>
              {field('instagram', 'Instagram')}
              <Field label="Coordenadas do mapa">
                <Input
                  value={draft.coordinates ?? ''}
                  placeholder="-8.3394, -34.9547"
                  inputMode="decimal"
                  onChange={(e) => update({ coordinates: e.target.value })}
                  aria-invalid={!!draft.coordinates && !parseCoordinates(draft.coordinates)}
                />
              </Field>
              <p className="xs muted -mt-1.5 leading-relaxed">
                Latitude e longitude separadas por vírgula. No Google Maps ou no OpenStreetMap, clique com o botão direito no local e copie as coordenadas. Elas não aparecem para o cliente: só posicionam o mapa da seção &quot;A casa&quot;.
              </p>
              {draft.coordinates && !parseCoordinates(draft.coordinates) ? <p className="xs b">Formato inválido. Use latitude, longitude (ex.: -8.3394, -34.9547).</p> : null}
              {parseCoordinates(draft.coordinates) ? <ShopMap coordinates={draft.coordinates} title={draft.tradeName} className="h-[200px]" /> : null}
            </div>
          </section>
          <div className="min-w-0" style={{ flex: '1 1 280px' }}>
            <section className="card mb-3.5">
              <h2 className="s b mb-3.5 mt-0">Marca</h2>
              <div className="rowx mb-3.5 gap-3.5">
                <div className="photo h-[74px] w-[74px] flex-[0_0_74px]">
                  {customLogo(draft) ? <img src={customLogo(draft)!} alt="Logo atual" className="h-[46px] w-[68px] object-contain" /> : <Logo width={68} height={46} />}
                </div>
                <div className="min-w-0">
                  <div className="s b truncate">{customLogo(draft) ? customLogo(draft)!.split('/').pop() : 'Logo padrão'}</div>
                  <div className="xs muted mt-[3px]">PNG com fundo transparente</div>
                  <div className="rowx gap-3 pt-[7px]">
                    <button type="button" className="xs lnk cursor-pointer border-0 bg-transparent p-0 text-[var(--ink)]" onClick={() => logoInput.current?.click()}>
                      {customLogo(draft) ? 'Substituir' : 'Enviar logo'}
                    </button>
                    {customLogo(draft) ? (
                      <button type="button" className="xs lnk cursor-pointer border-0 bg-transparent p-0 text-[var(--ink-muted)]" onClick={() => update({ logoUrl: '' })}>
                        Remover
                      </button>
                    ) : null}
                  </div>
                  <input ref={logoInput} type="file" accept="image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0], 'logoUrl')} />
                </div>
              </div>
              <div className="rowx mb-2.5">
                <span className="xs muted">Imagem da capa da landing{draft.coverUrl ? '' : ' · padrão'}</span>
                <span className="sp" />
                {draft.coverUrl ? (
                  <button type="button" className="xs lnk cursor-pointer border-0 bg-transparent p-0 text-[var(--ink-muted)]" onClick={() => update({ coverUrl: '' })}>
                    Remover capa
                  </button>
                ) : null}
              </div>
              <button type="button" className="photo group relative h-[108px] w-full cursor-pointer overflow-hidden border-0" onClick={() => coverInput.current?.click()} aria-label="Trocar imagem da capa">
                <img src={draft.coverUrl || DEFAULT_COVER} alt="" className="cover" />
                <span className="badge n absolute bottom-2 right-2 !bg-[rgba(10,10,10,.85)]">
                  <Icon name="image" size="s" /> Trocar
                </span>
              </button>
              <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0], 'coverUrl')} />
            </section>
            <section className="card">
              <h2 className="s b mb-1.5 mt-0">Onde esses dados aparecem</h2>
              <div className="list">
                <div className="li !py-[9px]">
                  <Icon name="home" size="s" />
                  <span className="m flex-1">Seção &quot;A casa&quot; na landing</span>
                </div>
                <div className="li !py-[9px]">
                  <Icon name="mail" size="s" />
                  <span className="m flex-1">Rodapé de todo e-mail</span>
                </div>
                <div className="li !py-[9px]">
                  <Icon name="receipt" size="s" />
                  <span className="m flex-1">Comprovante de pagamento</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </SettingsPage>
  );
}
