import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Botão shadcn com as variantes do design system (classes .btn do protótipo):
 * primary (prata sólida), ghost (contorno), dark (grafite), danger (tracejado).
 */
const buttonVariants = cva('btn', {
  variants: {
    variant: {
      primary: 'primary',
      ghost: 'ghost',
      dark: 'dark',
      danger: 'danger',
      outline: '',
    },
    size: {
      default: '',
      sm: 'sm',
    },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? children : loading ? <span className="inline-flex items-center gap-2"><Spinner />{children}</span> : children}
    </Comp>
  );
});
Button.displayName = 'Button';

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent', className)} aria-hidden="true" />;
}

export { buttonVariants };
