import ReactMarkdown from 'react-markdown';
import { Icon } from '@/components/brand/icon';

/**
 * Descrição em Markdown do serviço com o visual do protótipo: a lista vira o
 * card "O que está incluso" com checks e a citação (>) vira o aviso tracejado.
 */
export function ServiceMarkdown({ source }: { source: string }) {
  return (
    <ReactMarkdown
      components={{
        h2: ({ children }) => <div className="s b mb-2 mt-1">{children}</div>,
        h3: ({ children }) => <div className="s b mb-2 mt-1">{children}</div>,
        p: ({ children }) => <p className="m muted mb-3 leading-[1.65]">{children}</p>,
        strong: ({ children }) => <b className="text-[var(--ink)]">{children}</b>,
        ul: ({ children }) => <div className="card stack mb-3 !gap-[7px] !px-3.5 !py-3">{children}</div>,
        li: ({ children }) => (
          <div className="rowx m muted gap-2">
            <Icon name="check" size="s" className="text-[var(--ink)]" />
            <span>{children}</span>
          </div>
        ),
        blockquote: ({ children }) => (
          <div className="card note mb-3 flex items-start gap-2.5 !px-3.5 !py-3">
            <Icon name="alert" />
            <div className="xs muted leading-relaxed [&_p]:mb-0 [&_p]:text-[12px]">{children}</div>
          </div>
        ),
      }}
    >
      {source}
    </ReactMarkdown>
  );
}

/** Texto longo (termos, privacidade). */
export function DocMarkdown({ source }: { source: string }) {
  return (
    <div className="md">
      <ReactMarkdown>{source}</ReactMarkdown>
    </div>
  );
}
