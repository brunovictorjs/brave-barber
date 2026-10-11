'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/brand/icon';
import { Spinner } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

export interface MediaItem {
  url: string;
  kind: 'IMAGE' | 'VIDEO';
}

/**
 * Fotos e vídeos com envio, reordenação (a primeira é a capa) e remoção.
 * Os arquivos vão para o storage da API (disco local ou Supabase Storage).
 */
export function MediaGrid({ value, onChange, allowVideo = true, folder = 'catalog', columns = 5, max = 12 }: { value: MediaItem[]; onChange: (v: MediaItem[]) => void; allowVideo?: boolean; folder?: string; columns?: number; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: MediaItem[] = [];
      for (const file of Array.from(files).slice(0, max - value.length)) {
        const res = await api.upload<{ url: string; kind: 'IMAGE' | 'VIDEO' }>(`/admin/media?folder=${folder}`, file);
        added.push(res);
      }
      onChange([...value, ...added]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {value.map((m, i) => (
        <div
          key={m.url}
          draggable
          onDragStart={() => setDragging(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragging !== null) move(dragging, i);
            setDragging(null);
          }}
          className="photo group h-[84px] cursor-grab"
          style={i === 0 ? { border: '2px solid #f2f2f2' } : undefined}
        >
          {m.kind === 'VIDEO' ? <video src={m.url} className="cover" muted /> : <img src={m.url} alt="" className="cover" />}
          {i === 0 ? <span className="badge ok tl !h-[18px] !text-[9px]">Capa</span> : m.kind === 'VIDEO' ? <span className="badge info tl !h-[18px] !text-[9px]">Vídeo</span> : null}
          <div className="absolute inset-x-1 bottom-1 z-[2] flex justify-between opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button type="button" className="ibtn !h-6 !w-6 !bg-[rgba(10,10,10,.8)]" aria-label="Mover para a esquerda" onClick={() => move(i, i - 1)}>
              <Icon name="back" size="s" className="!h-3 !w-3" />
            </button>
            <button type="button" className="ibtn !h-6 !w-6 !bg-[rgba(10,10,10,.8)]" aria-label="Remover" onClick={() => onChange(value.filter((_, k) => k !== i))}>
              <Icon name="trash" size="s" className="!h-3 !w-3" />
            </button>
            <button type="button" className="ibtn !h-6 !w-6 !bg-[rgba(10,10,10,.8)]" aria-label="Mover para a direita" onClick={() => move(i, i + 1)}>
              <Icon name="chev" size="s" className="!h-3 !w-3" />
            </button>
          </div>
        </div>
      ))}
      {value.length < max ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading}
          className="grid h-[84px] cursor-pointer place-items-center content-center gap-[5px] rounded-[4px] border border-dashed border-[#5a5a5a] bg-transparent text-[#a6a6a6]"
        >
          {uploading ? <Spinner /> : <Icon name="plus" />}
          <span className="xs">{uploading ? 'enviando…' : 'adicionar'}</span>
        </button>
      ) : null}
      <input ref={input} type="file" hidden multiple accept={allowVideo ? 'image/*,video/mp4,video/webm' : 'image/*'} onChange={(e) => upload(e.target.files)} />
    </div>
  );
}
