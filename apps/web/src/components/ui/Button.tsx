import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'outline' | 'ghost' | 'light' | 'outline-light' | 'inverse';
type Size = 'md' | 'sm';

// Keep layout/spacing/color in separate maps so callers never need to override them via className.
const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium tracking-wide transition duration-300 ease-(--ease-soft) disabled:pointer-events-none disabled:opacity-50';

const sizes: Record<Size, string> = {
  md: 'rounded-full px-6 py-3 text-sm',
  sm: 'rounded-full px-5 py-2.5 text-xs',
};

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-bg hover:bg-accent hover:text-accent-ink',
  outline: 'border border-ink/30 text-ink hover:border-ink hover:bg-ink hover:text-bg',
  ghost: 'text-ink underline-offset-8 decoration-accent hover:underline',
  light: 'bg-white/95 text-neutral-900 hover:bg-white',
  'outline-light': 'border border-white/50 text-white hover:border-white hover:bg-white hover:text-neutral-900',
  inverse: 'bg-bg text-ink hover:bg-accent hover:text-accent-ink',
};

function classes(variant: Variant, size: Size, className?: string) {
  return cn(base, variant === 'ghost' ? 'py-1 text-sm' : sizes[size], variants[variant], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={classes(variant, size, className)} {...rest} />;
}

interface ButtonLinkProps {
  to: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function ButtonLink({ to, variant = 'primary', size = 'md', className, children }: ButtonLinkProps) {
  return (
    <Link to={to} className={classes(variant, size, className)}>
      {children}
    </Link>
  );
}

/** Arrow that points forward in both reading directions. */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={cn('size-4 shrink-0 rtl:-scale-x-100', className)} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 10h14M12 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
