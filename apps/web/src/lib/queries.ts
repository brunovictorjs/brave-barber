'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from './api';
import type {
  BarberProfile,
  Cart,
  Category,
  Notification,
  OrderView,
  Page,
  ProductCard,
  ProductDetail,
  ServiceCard,
  ServiceDetail,
  StorefrontHome,
} from './types';

// ── Vitrine e catálogo ─────────────────────────────────────────────────────

export const useStorefront = () => useQuery({ queryKey: ['storefront'], queryFn: () => api.get<StorefrontHome>('/storefront/home') });

export const useServices = (q: { category?: string; q?: string; sort?: string } = {}) =>
  useQuery({ queryKey: ['services', q], queryFn: () => api.get<ServiceCard[]>('/catalog/services', q), placeholderData: keepPreviousData });

export const useService = (slug: string) => useQuery({ queryKey: ['service', slug], queryFn: () => api.get<ServiceDetail>(`/catalog/services/${slug}`) });
export const useProduct = (slug: string) => useQuery({ queryKey: ['product', slug], queryFn: () => api.get<ProductDetail>(`/catalog/products/${slug}`) });

export const useProducts = (q: { category?: string; q?: string } = {}) =>
  useQuery({ queryKey: ['products', q], queryFn: () => api.get<ProductCard[]>('/catalog/products', q), placeholderData: keepPreviousData });

export const useCategories = (kind?: 'SERVICE' | 'PRODUCT') =>
  useQuery({ queryKey: ['categories', kind], queryFn: () => api.get<Category[]>('/catalog/categories', { kind }), staleTime: 5 * 60_000 });

export const useBarberProfile = (id: string) => useQuery({ queryKey: ['barber', id], queryFn: () => api.get<BarberProfile>(`/storefront/barbers/${id}`) });

// ── Carrinho ──────────────────────────────────────────────────────────────

export function useCart(enabled = true) {
  return useQuery({ queryKey: ['cart'], queryFn: () => api.get<Cart>('/cart'), enabled, staleTime: 5_000 });
}

export function useCartActions() {
  const qc = useQueryClient();
  const onSuccess = (cart: Cart) => qc.setQueryData(['cart'], cart);
  const onError = (e: unknown) => toast.error(errorMessage(e));
  return {
    add: useMutation({ mutationFn: (body: { serviceId?: string; productId?: string }) => api.post<Cart>('/cart/items', body), onSuccess, onError }),
    remove: useMutation({ mutationFn: (itemId: string) => api.delete<Cart>(`/cart/items/${itemId}`), onSuccess, onError }),
    quantity: useMutation({ mutationFn: (v: { itemId: string; quantity: number }) => api.patch<Cart>(`/cart/items/${v.itemId}`, { quantity: v.quantity }), onSuccess, onError }),
    schedule: useMutation({ mutationFn: (v: { date: string; time: string; barberId: string | null }) => api.put<Cart>('/cart/schedule', v), onSuccess }),
  };
}

// ── Favoritos ─────────────────────────────────────────────────────────────

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id, on }: { kind: 'services' | 'products' | 'barbers'; id: string; on: boolean }) =>
      on ? api.put(`/me/favorites/${kind}/${id}`) : api.delete(`/me/favorites/${kind}/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['services'] });
      void qc.invalidateQueries({ queryKey: ['service'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['product'] });
      void qc.invalidateQueries({ queryKey: ['favorites'] });
      void qc.invalidateQueries({ queryKey: ['barber'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['storefront'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

// ── Pedidos do cliente ────────────────────────────────────────────────────

export const useMyOrders = (tab: 'upcoming' | 'history', page = 1) =>
  useQuery({ queryKey: ['my-orders', tab, page], queryFn: () => api.get<Page<OrderView>>('/me/orders', { tab, page }), placeholderData: keepPreviousData });

export const useMyOrder = (code: string, opts: { refetchInterval?: number | false } = {}) =>
  useQuery({ queryKey: ['my-order', code], queryFn: () => api.get<OrderView>(`/me/orders/${code}`), refetchInterval: opts.refetchInterval });

// ── Avisos ────────────────────────────────────────────────────────────────

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ unread: number; items: Notification[] }>('/me/notifications'),
    enabled,
    refetchInterval: 60_000,
  });
}
