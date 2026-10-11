import { PageTransition } from '@/components/motion/motion';

export default function ClientTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
