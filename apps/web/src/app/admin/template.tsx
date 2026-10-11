import { PageTransition } from '@/components/motion/motion';

export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition className="flex min-w-0 flex-1 flex-col">{children}</PageTransition>;
}
