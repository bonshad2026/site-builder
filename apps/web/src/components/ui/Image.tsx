import type { ImageSize } from '@site-builder/shared';
import { useState, type CSSProperties } from 'react';
import { cn } from '../../lib/cn';

interface ImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  priority?: boolean;
  /** Optional size from the builder: fixed width and/or height, how the image fills it, rounded corners. */
  size?: ImageSize;
}

/** Image with a soft placeholder while loading and a graceful fallback when missing or broken. */
export function Image({ src, alt, className, priority, size }: ImageProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const box: CSSProperties = {};
  if (size?.width) Object.assign(box, { width: '100%', maxWidth: size.width });
  // A set height replaces the layout's aspect ratio.
  if (size?.height) Object.assign(box, { height: size.height, aspectRatio: 'auto' });
  if (size?.radius) box.borderRadius = size.radius;
  const fit = size?.fit === 'contain' ? 'object-contain' : size?.fit === 'fill' ? 'object-fill' : 'object-cover';

  return (
    <div className={cn('relative overflow-hidden bg-surface-2', className)} style={box}>
      {src && state !== 'error' ? (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className={cn('h-full w-full transition duration-700 ease-(--ease-soft)', fit, state === 'loaded' ? 'opacity-100' : 'opacity-0')}
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
