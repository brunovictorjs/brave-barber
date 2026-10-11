import { PageTransition } from '@/components/motion/motion';

export default function BarberTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
