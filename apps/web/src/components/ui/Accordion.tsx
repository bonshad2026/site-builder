import { useId, useState } from 'react';
import { cn } from '../../lib/cn';

export interface AccordionItem {
  id: string;
  title: string;
  content: string;
}

export function Accordion({ items, defaultOpen }: { items: AccordionItem[]; defaultOpen?: string }) {
  const [open, setOpen] = useState<string | null>(defaultOpen ?? null);
  const baseId = useId();

  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item) => {
        const isOpen = open === item.id;
        const panelId = `${baseId}-${item.id}-panel`;
        const buttonId = `${baseId}-${item.id}-button`;
        return (
          <div key={item.id}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : item.id)}
                className="flex w-full items-center justify-between gap-6 py-6 text-start text-lg text-ink transition-colors hover:text-accent sm:text-xl"
              >
                <span className="font-display">{item.title}</span>
                <span aria-hidden="true" className={cn('relative size-4 shrink-0 transition-transform duration-300', isOpen && 'rotate-45')}>
                  <span className="absolute inset-x-0 top-1/2 h-px bg-current" />
                  <span className="absolute inset-y-0 left-1/2 w-px bg-current" />
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="pb-6 pe-10 leading-relaxed text-ink-soft"
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
