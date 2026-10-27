import { useState } from 'react';
import { cn } from '../../lib/cn';

interface ImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  priority?: boolean;
}

/** Image with a soft placeholder while loading and a graceful fallback when missing or broken. */
export function Image({ src, alt, className, priority }: ImageProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');

  return (
    <div className={cn('relative overflow-hidden bg-surface-2', className)}>
      {src && state !== 'error' ? (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className={cn('h-full w-full object-cover transition duration-700 ease-(--ease-soft)', state === 'loaded' ? 'opacity-100' : 'opacity-0')}
        />
      ) : (
        <div role="img" aria-label={alt} className="flex h-full w-full items-center justify-center text-ink-soft/60">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="1" />
            <path d="m3 16 5-5 4 4 3-3 6 6" />
          </svg>
        </div>
      )}
    </div>
  );
}
