import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Internal paths use the router (and keep the /fa prefix); anything else is a normal link. */
export function SmartLink({ href, className, children, onClick }: { href: string; className?: string; children: ReactNode; onClick?: () => void }) {
  if (href.startsWith('/')) {
    return (
      <Link to={href} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }
  const external = /^https?:/i.test(href);
  return (
    <a href={href || '#'} className={className} onClick={onClick} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>
      {children}
    </a>
  );
}

/**
 * Plain text with paragraphs (blank line), bullet lines ("- ") and **bold**.
 * Never interprets HTML, so content cannot inject markup or scripts.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => l.trim().startsWith('- '))) {
          return (
            <ul key={i} className="my-4 list-disc space-y-1 ps-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.trim().slice(2))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="my-4 first:mt-0 last:mb-0">
            {inline(block)}
          </p>
        );
      })}
    </div>
  );
}
