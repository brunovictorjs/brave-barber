'use client';

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { brDate, dateKey } from '@/lib/format';
import { DocMarkdown } from './markdown';
import { Body, Screen, TopNav } from './shell';

export function LegalPage({ kind, title }: { kind: 'terms' | 'privacy'; title: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['legal', kind],
    queryFn: () => api.get<{ version: number; content: string; publishedAt: string }>(`/legal/${kind}`),
  });
  return (
    <Screen>
      <Body>
        <TopNav title={title} back />
        {isLoading ? (
          <div className="stack">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-40" />
          </div>
        ) : data ? (
          <>
            <p className="xs muted mb-5">
              Versão {data.version} · publicada em {brDate(dateKey(data.publishedAt))}
            </p>
            <DocMarkdown source={data.content} />
          </>
        ) : (
          <p className="m muted">Documento ainda não publicado.</p>
        )}
      </Body>
    </Screen>
  );
}
