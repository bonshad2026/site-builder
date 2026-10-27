import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12', className)}>{children}</div>;
}

export function Section({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('py-20 sm:py-28', className)}>
      {children}
    </section>
  );
}

interface HeadingProps {
  eyebrow?: string;
  title: string;
  intro?: string;
  as?: 'h1' | 'h2';
  align?: 'start' | 'center';
  action?: ReactNode;
}

export function SectionHeading({ eyebrow, title, intro, as: Tag = 'h2', align = 'start', action }: HeadingProps) {
  return (
    <div className={cn('mb-12 flex flex-col gap-6 sm:mb-16 md:flex-row md:items-end md:justify-between', align === 'center' && 'md:flex-col md:items-center text-center')}>
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
        <Tag className={cn('font-display text-ink leading-[1.08]', Tag === 'h1' ? 'text-5xl sm:text-6xl lg:text-7xl' : 'text-4xl sm:text-5xl')}>{title}</Tag>
        {intro && <p className="mt-6 text-base leading-relaxed text-ink-soft sm:text-lg">{intro}</p>}
      </div>
      {action}
    </div>
  );
}

/** Page intro band used by every inner page. */
export function PageHeader(props: Omit<HeadingProps, 'as'>) {
  return (
    <div className="border-b border-line pt-36 pb-4 sm:pt-44">
      <Container>
        <div className="reveal">
          <SectionHeading as="h1" {...props} />
        </div>
      </Container>
    </div>
  );
}
