import type { CollectionField, PublicCollection } from '@site-builder/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { FieldShell, Select, TextArea, TextInput } from '../../components/ui/Field';
import { ItemFilesEditor, type EditableFile } from '../../components/ui/ItemFilesEditor';
import { API_URL, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { errorLine } from '../../lib/errorText';
import { usePreferences } from '../../lib/preferences';
import { useSiteErrorLanguage } from '../public-site/data';
import { customerRequest, L, useCustomerApi, useText } from './customerApi';

type Loc = { en: string; fa: string };

interface ProfileData {
  table: PublicCollection & { editable: string[]; approval: boolean };
  item: { id: string; slug: string; title: Loc; status: 'draft' | 'published'; data: Record<string, unknown>; preview: Record<string, unknown>; imageUrl: string | null } | null;
}

interface Uploaded {
  id: string;
  url: string;
  name: string;
}

/** Uploads a photo or PDF for the customer's own item (with the customer's CSRF token). */
function uploadOwn(site: string, file: File, onProgress?: (f: number) => void): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/v1/public/sites/${site}/customer/files`);
    xhr.withCredentials = true;
    const token = document.cookie.match(new RegExp(`(?:^|;\\s*)sb_cc_${site}=([^;]+)`))?.[1];
    if (token) xhr.setRequestHeader('X-Customer-CSRF', decodeURIComponent(token));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      const json = (() => {
        try {
          return JSON.parse(xhr.responseText);
        } catch {
          return null;
        }
      })();
      if (xhr.status >= 200 && xhr.status < 300 && json?.data) resolve(json.data as Uploaded);
      else reject(new ApiError(xhr.status, json?.error?.code ?? 'upload_failed', json?.error?.message ?? 'Upload failed'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Network error during upload'));
    xhr.send(form);
  });
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? [v] : []);

/** One photo: shown, replaced by uploading another, or removed. */
function PhotoInput({ label, url, onChange }: { label: string; url: string | null; onChange: (up: Uploaded | null) => void }) {
  const t = useText();
  const api = useCustomerApi();
  const errLang = useSiteErrorLanguage();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="flex flex-wrap items-center gap-4">
        <div className="size-28 overflow-hidden rounded-full border border-line bg-surface-2">{url && <img src={url} alt="" className="h-full w-full object-cover" />}</div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError('');
            try {
              onChange(await uploadOwn(api.site, file));
            } catch (err) {
              setError(errorLine(err, errLang));
            } finally {
              setBusy(false);
              if (input.current) input.current.value = '';
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? t(L('Uploading…', 'در حال بارگذاری…')) : url ? t(L('Change photo', 'تغییر عکس')) : t(L('Upload a photo', 'بارگذاری عکس'))}
        </Button>
        {url && (
          <button type="button" className="text-sm text-ink-soft hover:text-danger" onClick={() => onChange(null)}>
            {t(L('Remove', 'حذف'))}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Published items of another table, as ticks (the courses a trainer can teach…). */
function ReferenceTicks({ field, value, onChange }: { field: CollectionField; value: string[]; onChange: (v: string[]) => void }) {
  const { l } = usePreferences();
  const api = useCustomerApi();
  const { data = [] } = useQuery({
    queryKey: ['public', api.site, 'ref-items', field.reference],
    queryFn: () => customerRequest<{ id: string; title: Loc }[]>(api.site, `/collections/${field.reference}/items?pageSize=60`),
  });
  return (
    <div className="flex flex-wrap gap-2">
      {data.map((i) => {
        const on = value.includes(i.id);
        return (
          <button
            key={i.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(field.multiple ? (on ? value.filter((x) => x !== i.id) : [...value, i.id]) : on ? [] : [i.id])}
            className={cn('rounded-full border px-3 py-1.5 text-sm transition', on ? 'border-ink bg-ink text-bg' : 'border-line hover:border-ink')}
          >
            {l(i.title)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The customer's own item in a self-service table (a trainer's profile): title, photo, texts,
 * choices and files with titles, then saved for the staff to approve (first time) or shown at once.
 */
export function MemberProfile() {
  const t = useText();
  const { l, locale } = usePreferences();
  const api = useCustomerApi();
  const qc = useQueryClient();
  const errLang = useSiteErrorLanguage();
  const key = ['public', api.site, 'customer', 'profile'];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<ProfileData | null>('/customer/profile') });
  if (isLoading) return <p className="text-ink-soft">{t(L('Loading…', 'در حال بارگذاری…'))}</p>;
  if (!data) return <p className="text-ink-soft">{t(L('This account has no page to fill.', 'این حساب صفحه‌ای برای تکمیل ندارد.'))}</p>;
  return <ProfileForm key={data.item?.id ?? 'new'} data={data} locale={locale} l={l} t={t} api={api} errLang={errLang} onSaved={(d) => qc.setQueryData(key, d)} />;
}

function ProfileForm({
  data,
  locale,
  l,
  t,
  api,
  errLang,
  onSaved,
}: {
  data: ProfileData;
  locale: 'en' | 'fa';
  l: (v: Loc | undefined) => string;
  t: (x: Loc) => string;
  api: ReturnType<typeof useCustomerApi>;
  errLang: ReturnType<typeof useSiteErrorLanguage>;
  onSaved: (d: ProfileData) => void;
}) {
  const { table, item } = data;
  const fields = table.fields.filter((f) => table.editable.includes(f.key));
  const [title, setTitle] = useState<Loc>(item?.title ?? { en: '', fa: '' });
  const [values, setValues] = useState<Record<string, unknown>>(item?.data ?? {});
  // Addresses of photos and files: saved ones from the preview, new ones from their upload.
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const v of Object.values(item?.preview ?? {}))
      for (const x of Array.isArray(v) ? v : [v]) {
        const o = x as { id?: string; url?: string } | null;
        if (o && typeof o === 'object' && o.id && o.url) out[o.id] = o.url;
      }
    return out;
  });
  const set = (k: string, v: unknown) => setValues((d) => ({ ...d, [k]: v }));
  const locText = (k: string) => ((values[k] as Loc | undefined)?.[locale] ?? '') as string;
  const setLoc = (k: string, v: string) => set(k, { ...((values[k] as Loc) ?? { en: '', fa: '' }), [locale]: v });
  const save = useMutation({
    mutationFn: () => api.put<ProfileData>('/customer/profile', { title, data: Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? null])) }),
    onSuccess: onSaved,
  });

  const input = (f: CollectionField) => {
    const id = `mp-${f.key}`;
    const label = `${l(f.label) || f.key}${f.required ? ' *' : ''}`;
    switch (f.type) {
      case 'image':
        return <PhotoInput key={f.key} label={label} url={urls[strings(values[f.key])[0] ?? ''] ?? null} onChange={(up) => { if (up) setUrls((u) => ({ ...u, [up.id]: up.url })); set(f.key, up?.id ?? null); }} />;
      case 'gallery': {
        const ids = strings(values[f.key]);
        return (
          <FieldShell key={f.key} id={id} label={label}>
            <div className="flex flex-wrap gap-2 pt-2">
              {ids.map((x) => (
                <div key={x} className="relative size-20 overflow-hidden rounded bg-surface-2">
                  {urls[x] && <img src={urls[x]} alt="" className="h-full w-full object-cover" />}
                  <button type="button" onClick={() => set(f.key, ids.filter((y) => y !== x))} className="absolute end-1 top-1 rounded-full bg-bg/90 px-1.5 text-xs" aria-label={t(L('Remove', 'حذف'))}>
                    ✕
                  </button>
                </div>
              ))}
              <PhotoInput label="" url={null} onChange={(up) => { if (!up) return; setUrls((u) => ({ ...u, [up.id]: up.url })); set(f.key, [...ids, up.id]); }} />
            </div>
          </FieldShell>
        );
      }
      case 'files': {
        const list = (Array.isArray(values[f.key]) ? (values[f.key] as EditableFile[]) : []).map((x) => ({ ...x, url: urls[x.id] }));
        return (
          <ItemFilesEditor
            key={f.key}
            label={label}
            files={list}
            onChange={(files) => set(f.key, files.map(({ id: fid, title: ft }) => ({ id: fid, title: ft })))}
            upload={async (file, onProgress) => {
              const up = await uploadOwn(api.site, file, onProgress);
              setUrls((u) => ({ ...u, [up.id]: up.url }));
              return up;
            }}
          />
        );
      }
      case 'textarea':
        return (
          <FieldShell key={f.key} id={id} label={label} hint={l(f.help) || undefined}>
            <TextArea id={id} rows={6} value={locText(f.key)} onChange={(e) => setLoc(f.key, e.target.value)} />
          </FieldShell>
        );
      case 'text':
        return (
          <FieldShell key={f.key} id={id} label={label} hint={l(f.help) || undefined}>
            <TextInput id={id} value={locText(f.key)} onChange={(e) => setLoc(f.key, e.target.value)} />
          </FieldShell>
        );
      case 'number':
        return (
          <FieldShell key={f.key} id={id} label={label}>
            <TextInput id={id} dir="ltr" inputMode="numeric" value={typeof values[f.key] === 'number' ? String(values[f.key]) : ''} onChange={(e) => set(f.key, e.target.value === '' ? null : Number(e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))))} />
          </FieldShell>
        );
      case 'boolean':
        return (
          <label key={f.key} className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
            {label}
          </label>
        );
      case 'select':
        return (
          <FieldShell key={f.key} id={id} label={label}>
            <Select id={id} value={(values[f.key] as string) ?? ''} onChange={(e) => set(f.key, e.target.value || null)}>
              <option value="">—</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {l(o.label) || o.value}
                </option>
              ))}
            </Select>
          </FieldShell>
        );
      case 'multiselect': {
        const list = strings(values[f.key]);
        return (
          <FieldShell key={f.key} id={id} label={label}>
            <div className="flex flex-wrap gap-2 pt-2">
              {f.options.map((o) => {
                const on = list.includes(o.value);
                return (
                  <button key={o.value} type="button" aria-pressed={on} onClick={() => set(f.key, on ? list.filter((x) => x !== o.value) : [...list, o.value])} className={cn('rounded-full border px-3 py-1.5 text-sm transition', on ? 'border-ink bg-ink text-bg' : 'border-line hover:border-ink')}>
                    {l(o.label) || o.value}
                  </button>
                );
              })}
            </div>
          </FieldShell>
        );
      }
      case 'reference':
        return (
          <FieldShell key={f.key} id={id} label={label}>
            <div className="pt-2">
              <ReferenceTicks field={f} value={strings(values[f.key])} onChange={(v) => set(f.key, v)} />
            </div>
          </FieldShell>
        );
      default:
        return (
          <FieldShell key={f.key} id={id} label={label}>
            <TextInput id={id} dir="ltr" type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'} value={(values[f.key] as string) ?? ''} onChange={(e) => set(f.key, e.target.value || null)} />
          </FieldShell>
        );
    }
  };

  const status = save.data?.item?.status ?? item?.status;
  const slug = save.data?.item?.slug ?? item?.slug;
  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className={cn('rounded-xl border p-4 text-sm', status === 'published' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900')}>
        {!status
          ? t(L('Fill in your page and save it. It is shown on the site after the site’s approval.', 'صفحه‌ی معرفی خود را تکمیل و ذخیره کنید. پس از تأیید مدیر سایت نمایش داده می‌شود.'))
          : status === 'draft'
            ? t(L('Saved. Your page is waiting for approval; you can still change it.', 'ذخیره شد. صفحه‌ی شما در انتظار تأیید است؛ همچنان می‌توانید آن را ویرایش کنید.'))
            : (
              <>
                {t(L('Your page is published. Changes show at once.', 'صفحه‌ی شما منتشر شده است. تغییرات بلافاصله نمایش داده می‌شوند.'))}{' '}
                {slug && (
                  <Link to={`/${table.slug}/${slug}`} className="underline underline-offset-4">
                    {t(L('See it', 'مشاهده'))}
                  </Link>
                )}
              </>
            )}
      </div>
      <FieldShell id="mp-title" label={`${t(L('Name shown on your page', 'نام نمایشی در صفحه'))} *`}>
        <TextInput id="mp-title" value={title[locale]} onChange={(e) => setTitle((x) => ({ ...x, [locale]: e.target.value }))} />
      </FieldShell>
      {fields.map(input)}
      {save.error && (
        <p role="alert" className="text-sm text-danger">
          {errorLine(save.error, errLang)}
        </p>
      )}
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={save.isPending || !(title.fa || title.en).trim()}>
          {t(L('Save', 'ذخیره'))}
        </Button>
        {save.isSuccess && <span className="text-sm text-emerald-700">✓</span>}
      </div>
    </form>
  );
}
