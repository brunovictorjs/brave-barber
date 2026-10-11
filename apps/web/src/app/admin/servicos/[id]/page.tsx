'use client';

import { use } from 'react';
import { ServiceEditor } from '@/components/admin/service-editor';

export default function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ServiceEditor id={id} />;
}
