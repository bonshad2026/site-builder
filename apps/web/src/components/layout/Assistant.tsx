import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSiteId, useSiteSettings } from '../../features/public-site/data';
import { api, apiAvailable } from '../../lib/api';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences';
import { RichText } from '../ui/SmartLink';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const KEEP = 12;

/**
 * The site's AI assistant: a round button with the character's picture that opens a chat.
 * Answers come from the API (GapGPT); the conversation lives only in this tab.
 */
export function Assistant() {
  const { l, locale } = usePreferences();
  const site = useSiteId();
  const { data: settings } = useSiteSettings();
  const a = settings?.assistant;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const fa = locale === 'fa';
  const name = a ? l(a.name) || (fa ? 'دستیار' : 'Assistant') : '';

  const ask = useMutation({
    mutationFn: (history: Message[]) => api.post<{ answer: string }>(`/public/sites/${site}/assistant`, { locale, messages: history.slice(-KEEP) }),
    onSuccess: (r) => setMessages((m) => [...m, { role: 'assistant', content: r.answer }]),
  });
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [messages, ask.isPending, open]);

  if (!a?.enabled || !apiAvailable()) return null;
  const send = (q: string) => {
    const question = q.trim();
    if (!question || ask.isPending) return;
    const history = [...messages, { role: 'user' as const, content: question }];
    setMessages(history);
    setText('');
    ask.mutate(history);
  };
  const avatar = a.avatarUrl ? (
    <img src={a.avatarUrl} alt="" className="h-full w-full object-cover" />
  ) : (
    <span aria-hidden className="text-2xl">
      💬
    </span>
  );
  const bottom = settings?.header.mobileNavigation === 'bottom' ? 'bottom-[calc(76px+env(safe-area-inset-bottom)+var(--sticky-h,0px)+12px)] lg:bottom-[calc(var(--sticky-h,0px)+16px)]' : 'bottom-[calc(var(--sticky-h,0px)+16px)]';

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={name}
          className={cn('fixed start-4 z-40 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-accent bg-surface shadow-lg transition hover:scale-105', bottom)}
        >
          {avatar}
        </button>
      )}
      {open && (
        <section
          role="dialog"
          aria-label={name}
          className={cn('fixed start-4 z-50 flex max-h-[70vh] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-2xl', bottom)}
        >
          <header className="flex items-center gap-3 bg-accent px-4 py-3 text-accent-ink">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface">{avatar}</span>
            <span className="flex-1 font-medium">{name}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label={fa ? 'بستن' : 'Close'} className="px-2 text-2xl leading-none opacity-80 hover:opacity-100">
              ×
            </button>
          </header>
          <div ref={list} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm" aria-live="polite">
            {l(a.greeting) && <Bubble role="assistant" text={l(a.greeting)} />}
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} text={m.content} />
            ))}
            {ask.isPending && <Bubble role="assistant" text="…" />}
            {ask.isError && <p className="text-center text-xs text-danger">{fa ? 'الان نمی‌توانم جواب بدهم؛ کمی بعد دوباره بپرسید.' : 'I can’t answer right now; please try again shortly.'}</p>}
            {!messages.length && a.suggestions.some((s) => l(s)) && (
              <div className="flex flex-wrap gap-2">
                {a.suggestions
                  .map((s) => l(s))
                  .filter(Boolean)
                  .map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line px-3 py-1 text-xs hover:border-accent hover:text-accent">
                      {s}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1500}
              placeholder={fa ? 'سؤالتان را بنویسید…' : 'Ask a question…'}
              className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button type="submit" disabled={ask.isPending || !text.trim()} className="rounded-md bg-accent px-4 text-sm text-accent-ink disabled:opacity-50">
              {fa ? 'ارسال' : 'Send'}
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function Bubble({ role, text }: { role: Message['role']; text: string }) {
  return (
    <div className={cn('max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 leading-relaxed', role === 'user' ? 'self-end bg-accent text-accent-ink' : 'self-start bg-surface-2')}>
      {role === 'assistant' ? <RichText text={text} /> : text}
    </div>
  );
}
