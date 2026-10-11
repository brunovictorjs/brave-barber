'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ShopSettings } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Logo } from './brand';

export const DEFAULT_LOGO = '/brand/logo.png';
export const DEFAULT_COVER = '/brand/cover.jpg';

/** Dados públicos da casa (logo, capa, endereço), com cache de alguns minutos. */
export function useBusiness() {
  return useQuery({
    queryKey: ['business'],
    queryFn: () => api.get<{ shop: ShopSettings }>('/business'),
    staleTime: 5 * 60_000,
  });
}

/** Logo enviada pelo administrador; sem ela (ou antes de carregar), a logo padrão do site. */
export function customLogo(shop?: Pick<ShopSettings, 'logoUrl'> | null): string | null {
  const url = shop?.logoUrl?.trim();
  return url && url !== DEFAULT_LOGO ? url : null;
}

export function coverUrl(shop?: Pick<ShopSettings, 'coverUrl'> | null): string {
  return shop?.coverUrl?.trim() || DEFAULT_COVER;
}

/** A logo da casa em qualquer tela. */
export function ShopLogo({ width = 78, height = 52, className, priority }: { width?: number; height?: number; className?: string; priority?: boolean }) {
  const { data } = useBusiness();
  const url = customLogo(data?.shop);
  if (!url) return <Logo width={width} height={height} className={className} priority={priority} />;
  return <img src={url} alt={data?.shop.tradeName ?? 'Logo'} width={width} height={height} className={cn('object-contain', className)} style={{ width, height }} />;
}

/** Mapa do OpenStreetMap a partir de "latitude, longitude". */
export function parseCoordinates(value?: string | null): { lat: number; lon: number } | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(value ?? '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export function ShopMap({ coordinates, title, className }: { coordinates?: string | null; title: string; className?: string }) {
  const c = parseCoordinates(coordinates);
  if (!c) return null;
  const d = 0.004;
  const bbox = [c.lon - d, c.lat - d * 0.6, c.lon + d, c.lat + d * 0.6].map((n) => n.toFixed(5)).join(',');
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${c.lat},${c.lon}`;
  const link = `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}`;
  return (
    <div className={cn('relative overflow-hidden rounded-[4px] border border-[var(--line)]', className)}>
      <iframe title={`Mapa: ${title}`} src={src} loading="lazy" className="block h-full w-full border-0" style={{ filter: 'grayscale(1) invert(.92) contrast(.9)' }} referrerPolicy="no-referrer" />
      <a href={link} target="_blank" rel="noreferrer" className="badge n absolute bottom-2 right-2 !bg-[rgba(10,10,10,.85)]">
        Abrir no Google Maps
      </a>
    </div>
  );
}
