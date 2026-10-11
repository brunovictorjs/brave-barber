'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

gsap.registerPlugin(useGSAP);

const REDUCED = '(prefers-reduced-motion: reduce)';

/**
 * Entrada em cascata: os filhos marcados com data-reveal (ou os filhos
 * diretos) sobem e aparecem um depois do outro. Respeita "reduzir movimento".
 */
export function Reveal({
  children,
  className,
  as: Tag = 'div',
  stagger = 0.05,
  y = 16,
  deps = [],
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'main' | 'ul';
  stagger?: number;
  y?: number;
  deps?: unknown[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const marked = el.querySelectorAll<HTMLElement>('[data-reveal]');
      const targets = marked.length ? Array.from(marked) : (Array.from(el.children) as HTMLElement[]);
      const mm = gsap.matchMedia();
      mm.add(`not ${REDUCED}`, () => {
        gsap.from(targets, { y, autoAlpha: 0, duration: 0.55, ease: 'power3.out', stagger, clearProps: 'transform,opacity,visibility' });
      });
      return () => mm.revert();
    },
    { scope: ref, dependencies: deps },
  );
  const Comp = Tag as 'div';
  return (
    <Comp ref={ref} className={className}>
      {children}
    </Comp>
  );
}

/** Transição entre páginas (usada nos template.tsx de cada área). */
export function PageTransition({ children, className = 'flex w-full flex-1 flex-col items-center' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(`not ${REDUCED}`, () => {
        gsap.from(ref.current, { autoAlpha: 0, y: 10, duration: 0.4, ease: 'power2.out', clearProps: 'all' });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Número que conta até o valor (KPIs, ganhos). */
export function CountUp({ value, format, className, duration = 0.9 }: { value: number; format: (n: number) => string; className?: string; duration?: number }) {
  const [display, setDisplay] = useState(() => format(value));
  const current = useRef({ n: 0 });
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia(REDUCED).matches) {
      setDisplay(format(value));
      current.current.n = value;
      return;
    }
    const tween = gsap.to(current.current, {
      n: value,
      duration,
      ease: 'power2.out',
      onUpdate: () => setDisplay(format(Math.round(current.current.n))),
    });
    return () => {
      tween.kill();
    };
  }, [value, format, duration]);
  return <span className={className}>{display}</span>;
}

/** Barras do gráfico crescendo a partir da base. */
export function Bars({ values, highlight, height = 110, label, className }: { values: number[]; highlight?: number; height?: number; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...values);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(`not ${REDUCED}`, () => {
        gsap.from(ref.current!.children, { scaleY: 0, duration: 0.7, ease: 'power3.out', stagger: 0.04 });
      });
      return () => mm.revert();
    },
    { scope: ref, dependencies: [values.join(',')] },
  );
  return (
    <div ref={ref} className={cn('bars', className)} style={{ height }} role="img" aria-label={label}>
      {values.map((v, i) => (
        <i key={i} className={i === highlight ? 'hl' : undefined} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

/** Rosca de participação (até 3 fatias, tons de aço). */
export function Donut({ parts, label }: { parts: number[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const total = parts.reduce((s, p) => s + p, 0) || 1;
  const colors = ['#f2f2f2', '#8c8c8c', '#4a4a4a'];
  let acc = 0;
  const stops = parts
    .slice(0, 3)
    .map((p, i) => {
      const from = (acc / total) * 100;
      acc += p;
      return `${colors[i]} ${from}% ${(acc / total) * 100}%`;
    })
    .join(', ');
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(`not ${REDUCED}`, () => {
        gsap.from(ref.current, { rotate: -90, scale: 0.85, autoAlpha: 0, duration: 0.8, ease: 'power3.out' });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return <div ref={ref} className="donut" style={{ background: `conic-gradient(${stops || '#3a3a3a 0 100%'})` }} role="img" aria-label={label} />;
}

/** Brilho que atravessa o texto cromado ("Pago", "Reservado", cronômetro). */
export function ChromeText({ children, className, as: Tag = 'span', style }: { children: React.ReactNode; className?: string; as?: 'span' | 'h1' | 'div'; style?: React.CSSProperties }) {
  const ref = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(`not ${REDUCED}`, () => {
        gsap.fromTo(ref.current, { backgroundPosition: '0% 0%' }, { backgroundPosition: '0% 100%', duration: 2.4, ease: 'sine.inOut', repeat: -1, yoyo: true });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  const Comp = Tag as 'span';
  return (
    <Comp ref={ref as React.Ref<HTMLSpanElement>} className={cn('bb-chrome', className)} style={{ backgroundSize: '100% 180%', ...style }}>
      {children}
    </Comp>
  );
}

/** Selo de sucesso que "carimba" ao aparecer (pedido pago/reservado). */
export function Stamp({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(`not ${REDUCED}`, () => {
        gsap.from(ref.current, { scale: 0.4, autoAlpha: 0, rotate: -20, duration: 0.7, ease: 'back.out(2)' });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Pulso suave (selo "Ao vivo"). */
export function Pulse({ children, active = true }: { children: React.ReactNode; active?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      if (!active) return;
      const mm = gsap.matchMedia();
      mm.add(`not ${REDUCED}`, () => {
        gsap.to(ref.current, { opacity: 0.55, duration: 0.9, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      });
      return () => mm.revert();
    },
    { scope: ref, dependencies: [active] },
  );
  return <span ref={ref}>{children}</span>;
}
