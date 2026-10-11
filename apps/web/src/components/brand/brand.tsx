import Image from 'next/image';
import type { Avatar as AvatarData, DisplayStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

/** Logo cromada (monograma BB + wordmark). Nunca recolorir. */
export function Logo({ width = 78, height = 52, className, priority }: { width?: number; height?: number; className?: string; priority?: boolean }) {
  return (
    <Image src="/brand/logo.png" alt="Brave Barber" width={width} height={height} priority={priority} className={cn('object-contain', className)} style={{ width, height }} />
  );
}

export function Avatar({ data, size = 40, className, ring }: { data: AvatarData; size?: number; className?: string; ring?: string }) {
  return (
    <div className={cn('av', data.variant, className)} style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.32)), borderColor: ring }} aria-hidden="true">
      {data.url ? <img src={data.url} alt="" /> : data.initials}
    </div>
  );
}

const STATUS_CLASS: Record<DisplayStatus, string> = {
  CART: 'badge info dot',
  PROCESSING: 'badge n dot',
  AWAITING_PAYMENT: 'badge info dot',
  PAID: 'badge ok dot',
  LATE: 'badge warn dot',
  READY_FOR_PICKUP: 'badge ok dot',
  IN_SERVICE: 'badge warn dot',
  COMPLETED: 'badge n dot',
  CANCELLED: 'badge bad dot',
  NO_SHOW: 'badge bad dot',
};

export function StatusBadge({ status, label, className }: { status: DisplayStatus; label: string; className?: string }) {
  return <span className={cn(STATUS_CLASS[status], className)}>{label}</span>;
}

export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn('stars', className)} role="img" aria-label={`${value} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} aria-hidden="true" style={{ width: size, height: size }}>
          <use href={i <= Math.round(value) ? '#star' : '#staro'} />
        </svg>
      ))}
    </span>
  );
}

export function RatingBadge({ average, count, compact, className }: { average: number | null; count?: number; compact?: boolean; className?: string }) {
  if (average == null) return <span className={cn('xs muted', className)}>sem avaliações</span>;
  return (
    <span className={cn('rate xs', className)}>
      <Icon name="star" size="s" className="!h-3 !w-3" />
      {average.toFixed(1).replace('.', ',')}
      {count !== undefined && !compact ? <span className="muted font-medium"> · {count}</span> : null}
      {count !== undefined && compact ? <span className="muted font-medium"> ({count})</span> : null}
    </span>
  );
}

/** Foto do serviço/produto ou, sem foto, o ícone sobre a textura de aço escovado. */
export function Photo({ url, icon, className, style, children, iconSize = 'l' }: { url?: string | null; icon: string; className?: string; style?: React.CSSProperties; children?: React.ReactNode; iconSize?: 's' | 'md' | 'l' }) {
  return (
    <div className={cn('photo', className)} style={style}>
      {url ? <img src={url} alt="" className="cover" /> : <Icon name={icon} size={iconSize} />}
      {children}
    </div>
  );
}

export function Note({ icon = 'info', children, dashed = false, className }: { icon?: string; children: React.ReactNode; dashed?: boolean; className?: string }) {
  return (
    <div className={cn('card flex items-start gap-2.5', dashed && 'note', className)}>
      <Icon name={icon} />
      <div className="xs muted leading-relaxed">{children}</div>
    </div>
  );
}

export function Empty({ icon = 'info', title, children }: { icon?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="card note center flex flex-col items-center gap-2 py-8">
      <Icon name={icon} size="l" className="text-[var(--chrome-mid)]" />
      <div className="s b">{title}</div>
      {children ? <div className="xs muted max-w-[32ch]">{children}</div> : null}
    </div>
  );
}
