import { useRef, useState } from 'react';
import { usePreferences } from '../../lib/preferences';

export interface EditableFile {
  id: string;
  title: string;
  /** Known after an upload or from the saved item: shown as a link. */
  url?: string;
  name?: string;
}

/**
 * The files of a `files` field: each one uploaded (PDF or image) and given a title, in order.
 * `upload` stores the file and returns its id and address; the admin and the customer's own
 * profile upload to different places.
 */
export function ItemFilesEditor({
  label,
  files,
  onChange,
  upload,
  max = 20,
}: {
  label: string;
  files: EditableFile[];
  onChange: (files: EditableFile[]) => void;
  upload: (file: File, onProgress: (fraction: number) => void) => Promise<{ id: string; url: string; name?: string }>;
  max?: number;
}) {
  const { locale } = usePreferences();
  const fa = locale === 'fa';
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const set = (i: number, patch: Partial<EditableFile>) => onChange(files.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= files.length) return;
    const next = [...files];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const add = async (file: File) => {
    setError('');
    setProgress(0);
    try {
      const up = await upload(file, setProgress);
      const title = file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 160);
      onChange([...files, { id: up.id, url: up.url, name: up.name ?? file.name, title }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-line p-3">
      <legend className="px-1 text-xs font-medium text-ink-soft">{label}</legend>
      {files.map((f, i) => (
        <div key={f.id} className="flex flex-wrap items-center gap-2">
          <span aria-hidden className="text-ink-soft">
            📄
          </span>
          <input
            value={f.title}
            maxLength={160}
            onChange={(e) => set(i, { title: e.target.value })}
            aria-label={fa ? 'عنوان فایل' : 'File title'}
            placeholder={fa ? 'عنوان فایل (مثلاً رزومه)' : 'File title (e.g. CV)'}
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-2 text-sm"
          />
          {f.url && (
            <a href={f.url} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-4">
              {fa ? 'دیدن' : 'Open'}
            </a>
          )}
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-2 text-sm disabled:opacity-30" aria-label={fa ? 'بالا' : 'Up'}>
            ↑
          </button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === files.length - 1} className="rounded px-2 text-sm disabled:opacity-30" aria-label={fa ? 'پایین' : 'Down'}>
            ↓
          </button>
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded px-2 text-sm text-red-700" aria-label={fa ? 'حذف' : 'Remove'}>
            ✕
          </button>
        </div>
      ))}
      {!files.length && <p className="text-xs text-ink-soft">{fa ? 'هنوز فایلی نیست.' : 'No files yet.'}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => e.target.files?.[0] && add(e.target.files[0])} />
        <button
          type="button"
          disabled={progress !== null || files.length >= max}
          onClick={() => input.current?.click()}
          className="rounded-full border border-ink/30 px-4 py-1.5 text-sm transition hover:bg-ink hover:text-bg disabled:opacity-50"
        >
          {progress === null ? (fa ? 'افزودن فایل (PDF یا تصویر)' : 'Add a file (PDF or image)') : `${Math.round(progress * 100)}%`}
        </button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </fieldset>
  );
}
