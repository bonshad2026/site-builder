import type { ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * Internal paths use the router (and keep the /fa prefix); anything else is a normal link.
 * External links open in a new tab; `newTab` does that for internal ones too.
 */
export function SmartLink({ href, className, children, onClick, newTab }: { href: string; className?: string; children: ReactNode; onClick?: () => void; newTab?: boolean }) {
  if (href.startsWith('/')) {
    return (
      <Link to={href} className={className} onClick={onClick} {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}>
        {children}
      </Link>
    );
  }
  const external = /^https?:/i.test(href);
  return (
    <a href={href || '#'} className={className} onClick={onClick} {...(external || newTab ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>
      {children}
    </a>
  );
}

/** **bold** and [text](link) inside a line; links only to site paths, https and mailto / tel. */
function inlineMarks(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\((?:\/|https?:\/\/|mailto:|tel:)[^)\s]*\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link)
      return (
        <SmartLink key={i} href={link[2]} className="text-ink underline decoration-accent underline-offset-4 hover:decoration-2">
          {link[1]}
        </SmartLink>
      );
    return part;
  });
}

/**
 * Plain text with paragraphs (blank line), headings ("## " / "### "), bullet lines ("- "),
 * numbered lines ("1. "), **bold** and [links](/path). Never interprets HTML, so content cannot
 * inject markup or scripts.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  const inline = inlineMarks;
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        const head = /^(#{2,3})\s+(.+)$/.exec(lines[0].trim());
        if (head && lines.length === 1) {
          return head[1] === '##' ? (
            <h3 key={i} className="mb-3 mt-10 font-display text-2xl leading-snug text-ink first:mt-0">
              {inline(head[2])}
            </h3>
          ) : (
            <h4 key={i} className="mb-2 mt-8 text-lg font-semibold text-ink first:mt-0">
              {inline(head[2])}
            </h4>
          );
        }
        const list = (items: string[], key: string | number) =>
          items.every((l) => /^\d+[.)]\s/.test(l.trim())) ? (
            <ol key={key} className="my-4 list-decimal space-y-1 ps-6">
              {items.map((l, j) => (
                <li key={j}>{inline(l.trim().replace(/^\d+[.)]\s+/, ''))}</li>
              ))}
            </ol>
          ) : items.every((l) => l.trim().startsWith('- ')) ? (
            <ul key={key} className="my-4 list-disc space-y-1 ps-5">
              {items.map((l, j) => (
                <li key={j}>{inline(l.trim().slice(2))}</li>
              ))}
            </ul>
          ) : null;
        const whole = list(lines, i);
        if (whole) return whole;
        // A lead-in line straight above a list ("**Skills**" then "- …" lines) keeps the list.
        const rest = lines.length > 1 ? list(lines.slice(1), 'list') : null;
        if (rest) {
          return (
            <div key={i}>
              <p className="mt-4 first:mt-0">{inline(lines[0])}</p>
              {rest}
            </div>
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
