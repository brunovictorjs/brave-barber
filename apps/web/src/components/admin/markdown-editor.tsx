'use client';

import { useRef, useState } from 'react';
import { DocMarkdown, ServiceMarkdown } from '@/components/client/markdown';
import { cn } from '@/lib/utils';

/**
 * Editor de texto em Markdown com barra de formatação e pré-visualização no
 * visual do site (descrição de serviço, política de privacidade, termos).
 */
export function MarkdownEditor({ value, onChange, minHeight = 250, variant = 'doc' }: { value: string; onChange: (v: string) => void; minHeight?: number; variant?: 'doc' | 'service' }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  const wrap = (before: string, after = before, placeholder = 'texto') => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  };

  const line = (prefix: string) => {
    const el = ref.current;
    if (!el) return;
    const start = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
    onChange(value.slice(0, start) + prefix + value.slice(start));
    requestAnimationFrame(() => el.focus());
  };

  const tools: [string, () => void, string?][] = [
    ['B', () => wrap('**'), 'font-extrabold'],
    ['I', () => wrap('_'), 'italic'],
    ['H2', () => line('## ')],
    ['H3', () => line('### ')],
    ['lista', () => line('- ')],
    ['numerada', () => line('1. ')],
    ['link', () => wrap('[', '](https://)', 'texto do link')],
    ['citação', () => line('> ')],
  ];

  return (
    <div>
      <div className="tbar" role="toolbar" aria-label="Formatação">
        {tools.map(([label, fn, cls]) => (
          <button key={label} type="button" className={cn('tbtn', cls)} onClick={fn} disabled={preview}>
            {label}
          </button>
        ))}
        <span className="sp" />
        <button type="button" className={cn('tbtn', !preview && 'on')} onClick={() => setPreview(false)}>
          Markdown
        </button>
        <button type="button" className={cn('tbtn', preview && 'on')} onClick={() => setPreview(true)}>
          Pré-visualizar
        </button>
      </div>
      <div className="editor" style={{ minHeight }}>
        {preview ? (
          variant === 'service' ? (
            <ServiceMarkdown source={value || '_Sem descrição._'} />
          ) : (
            <DocMarkdown source={value || '_Sem conteúdo._'} />
          )
        ) : (
          <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} style={{ minHeight: minHeight - 36 }} aria-label="Conteúdo em Markdown" />
        )}
      </div>
    </div>
  );
}
