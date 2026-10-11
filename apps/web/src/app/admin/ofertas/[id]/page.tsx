'use client';

import { use } from 'react';
import { OfferEditor } from '@/components/admin/offer-editor';

export default function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <OfferEditor id={id} />;
}
