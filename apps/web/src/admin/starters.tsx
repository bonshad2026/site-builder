import type { StarterAction, StarterApply, StarterCheck, StarterCheckRow, StarterKind, StarterPack, StarterScan } from '@site-builder/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { usePreferences } from '../lib/preferences';
import type { StarterPreviewMessage } from './StarterPreviewFrame';
import { Badge, Checkbox, ConfirmButton, ErrorNote, Field, Modal, SelectField, Spinner, TextField, useToast } from './ui';

/**
 * The studio's starting points (control DB, `/platform/starters`): self-contained packs of pages
 * and tables with the tables, item pages, forms, box designs, photos and sample items they use,
 * and a site's header or footer. Each sits in a group. "Save as starter" shows what goes in;
 * using a starter on a site shows what the site has, lacks or has differently, and lets each be
 * made, mapped or left out. A preview shows it with its own sample data.
 */
export type { StarterKind };
export interface Starter {
  id: string;
  kind: StarterKind;
  name: string;
  description: string;
  group: string;
  /** Ready-made by the studio (null: saved by the operator). */
  sampleKey: string | null;
  data: StarterPack;
  summary: { pages: number; sections: number; tables: number; items: number; forms: number; photos: number; needs: number };
}

type Lbl = { en: string; fa: string };
const key = (kind?: StarterKind) => (kind ? ['starters', kind] : ['starters']);

export function useStarters(kind?: StarterKind, enabled = true) {
  return useQuery({ queryKey: key(kind), queryFn: () => api.get<Starter[]>(`/platform/starters${kind ? `?kind=${kind}` : ''}`), enabled });
}

/** Starters by group, groups in name order with the ungrouped last. */
export function byGroup(list: Starter[]): [string, Starter[]][] {
  const groups = new Map<string, Starter[]>();
  for (const s of list) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  return [...groups].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
}

/** A drop-down of starters under their groups. */
export function StarterSelect({ label, value, onChange, list, empty, extra, className }: { label: string; value: string; onChange: (v: string) => void; list: Starter[]; empty: string; extra?: ReactNode; className?: string }) {
  const { l } = usePreferences();
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink">
        <option value="">{empty}</option>
        {extra}
        {byGroup(list).map(([group, items]) => (
          <optgroup key={group || '-'} label={group || l({ en: 'No group', fa: 'بدون گروه' })}>
            {items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** "Start from": empty or a saved starter (by group), with its preview and a button to delete it. */
export function StarterPicker({ kind, value, onChange, siteId }: { kind: StarterKind; value: string; onChange: (id: string) => void; siteId?: string }) {
  const { l } = usePreferences();
  const qc = useQueryClient();
  const list = useStarters(kind);
  const [preview, setPreview] = useState(false);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/platform/starters/${id}`),
    onSuccess: () => {
      onChange('');
      qc.invalidateQueries({ queryKey: key() });
    },
  });
  if (!list.data?.length) return null;
  const chosen = list.data.find((s) => s.id === value);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <StarterSelect className="min-w-0 flex-1" label={l({ en: 'Start from', fa: 'شروع از' })} value={value} onChange={onChange} list={list.data} empty={l({ en: 'Empty', fa: 'خالی' })} />
      {chosen && (
        <Button type="button" variant="outline" size="sm" onClick={() => setPreview(true)}>
          {l({ en: 'Preview', fa: 'پیش‌نمایش' })}
        </Button>
      )}
      {value && <ConfirmButton label={l({ en: 'Delete starter', fa: 'حذف الگو' })} confirmText={l({ en: 'Delete this starter?', fa: 'این الگو حذف شود؟' })} variant="ghost" onConfirm={() => remove.mutate(value)} />}
      {preview && chosen && <StarterPreviewDialog starter={chosen} siteId={siteId} onClose={() => setPreview(false)} />}
    </div>
  );
}

const REASONS: Record<string, Lbl> = {
  chosen: { en: 'chosen', fa: 'انتخاب‌شده' },
  table: { en: 'shown on the page', fa: 'در صفحه نمایش داده می‌شود' },
  reference: { en: 'a table points to it', fa: 'جدولی به آن ارجاع می‌دهد' },
  detail: { en: 'page of each item', fa: 'صفحه‌ی هر آیتم' },
  link: { en: 'linked from the page', fa: 'از صفحه لینک شده' },
};
const MODULE_NAMES: Record<string, Lbl> = {
  products: { en: 'Products (shop)', fa: 'محصولات (فروشگاه)' },
  services: { en: 'Services', fa: 'خدمات' },
  orders: { en: 'Orders and cart', fa: 'سفارش و سبد خرید' },
  leads: { en: 'Requests', fa: 'درخواست‌ها' },
  projects: { en: 'Projects', fa: 'پروژه‌ها' },
  testimonials: { en: 'Reviews', fa: 'نظرات' },
  faq: { en: 'FAQ', fa: 'پرسش‌ها' },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {children}
    </section>
  );
}

/* ---------- saving ---------- */

/** A starter's group: type a new one or pick one of this kind's groups. */
export function GroupField({ kind, value, onChange }: { kind: StarterKind; value: string; onChange: (v: string) => void }) {
  const { l } = usePreferences();
  const list = useStarters(kind);
  const id = useId();
  const groups = [...new Set((list.data ?? []).map((s) => s.group).filter(Boolean))].sort();
  return (
    <Field label={l({ en: 'Group', fa: 'گروه' })} hint={l({ en: 'Pick one or type a new name (e.g. 404 pages).', fa: 'یکی را انتخاب کنید یا نام تازه بنویسید (مثلاً صفحه‌های ۴۰۴).' })}>
      {(fieldId) => (
        <>
          <input id={fieldId} list={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={60} className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink" />
          <datalist id={id}>
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </>
      )}
    </Field>
  );
}

/**
 * "Save as starter": the chosen page or table plus what it uses (found by the API); tables and
 * item pages go in unless unticked, other linked pages only when ticked. Saves a new starter or
 * replaces the contents of an existing one.
 */
export function SaveStarterDialog({ siteId, kind, slug, name: defaultName, onClose }: { siteId: string; kind: StarterKind; slug: string; name: string; onClose: () => void }) {
  const { l } = usePreferences();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [group, setGroup] = useState('');
  const [replace, setReplace] = useState('');
  const [extraPages, setExtraPages] = useState<string[]>([]);
  const [skip, setSkip] = useState<{ pages: string[]; tables: string[] }>({ pages: [], tables: [] });
  const [samples, setSamples] = useState(true);
  const starters = useStarters(kind);
  const selection = { pages: kind === 'page' ? [slug, ...extraPages] : extraPages, tables: kind === 'table' ? [slug] : [], skip, samples };
  const scan = useQuery({
    queryKey: ['site', siteId, 'starter-scan', kind, selection],
    queryFn: () => api.post<StarterScan>(`/sites/${siteId}/starters/scan`, { kind, ...selection }),
    placeholderData: keepPreviousData,
  });
  const save = useMutation({
    mutationFn: () => api.post<Starter>(`/sites/${siteId}/starters`, { kind, name, description, group, ...selection, ...(replace ? { replace } : {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key() });
      toast(replace ? l({ en: 'Starter updated', fa: 'الگو به‌روز شد' }) : l({ en: 'Saved to the starters', fa: 'در بانک الگوها ذخیره شد' }));
      onClose();
    },
  });
  const toggle = (list: string[], v: string, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));
  const s = scan.data;

  return (
    <Modal open onClose={onClose} title={l({ en: 'Save as starter', fa: 'ذخیره به‌عنوان الگو' })} wide>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <StarterSelect
          label={l({ en: 'Save as', fa: 'ذخیره به‌صورت' })}
          value={replace}
          onChange={(v) => {
            setReplace(v);
            const old = starters.data?.find((x) => x.id === v);
            if (old) {
              setName(old.name);
              setDescription(old.description);
              setGroup(old.group);
            }
          }}
          list={starters.data ?? []}
          empty={l({ en: 'A new starter (or pick one below to replace it)', fa: 'الگوی جدید (یا یکی را برای جایگزینی انتخاب کنید)' })}
        />
        <TextField label={l({ en: 'Name of the starter', fa: 'نام الگو' })} value={name} onChange={setName} required />
        <GroupField kind={kind} value={group} onChange={setGroup} />
        <TextField label={l({ en: 'Description', fa: 'توضیح' })} value={description} onChange={setDescription} multiline />
        {(kind === 'header' || kind === 'footer') && <p className="text-xs text-ink-soft">{l({ en: 'The saved settings are used: save your changes first.', fa: 'تنظیمات ذخیره‌شده استفاده می‌شود؛ اول تغییراتتان را ذخیره کنید.' })}</p>}

        {scan.isLoading ? (
          <Spinner />
        ) : (
          <>
            <ErrorNote error={scan.error} />
            {s && (
              <div className={`flex flex-col gap-5 ${scan.isFetching ? 'opacity-60' : ''}`}>
                <Section title={l({ en: 'Pages', fa: 'صفحه‌ها' })}>
                  {s.pages.map((p) => {
                    const fixed = p.reason === 'chosen';
                    return (
                      <div key={p.slug} className="flex flex-wrap items-center gap-2">
                        {fixed ? (
                          <span className="text-sm font-medium text-ink">✓ {l(p.title)}</span>
                        ) : (
                          <Checkbox
                            label={l(p.title)}
                            checked={p.included}
                            onChange={(on) => {
                              if (p.reason === 'link') setExtraPages((x) => toggle(x, p.slug, on));
                              else setSkip((x) => ({ ...x, pages: toggle(x.pages, p.slug, !on) }));
                            }}
                          />
                        )}
                        <span className="text-xs text-ink-soft" dir="ltr">
                          /{p.slug}
                        </span>
                        <Badge>{l(REASONS[p.reason])}</Badge>
                      </div>
                    );
                  })}
                  {!!s.missing.length && (
                    <p className="text-xs text-ink-soft">
                      {l({ en: 'Links to pages this site does not have:', fa: 'لینک به صفحه‌هایی که این سایت ندارد:' })}{' '}
                      <span dir="ltr">{s.missing.map((x) => `/${x}`).join('، ')}</span>
                    </p>
                  )}
                </Section>

                {!!s.tables.length && (
                  <Section title={l({ en: 'Tables', fa: 'جدول‌ها' })}>
                    {s.tables.map((t) =>
                      t.reason === 'chosen' ? (
                        <span key={t.slug} className="text-sm font-medium text-ink">
                          ✓ {l(t.name)} · {t.items} {l({ en: 'items', fa: 'آیتم' })}
                        </span>
                      ) : (
                        <div key={t.slug} className="flex flex-wrap items-center gap-2">
                          <Checkbox label={`${l(t.name)} · ${t.items} ${l({ en: 'items', fa: 'آیتم' })}`} checked={t.included} onChange={(on) => setSkip((x) => ({ ...x, tables: toggle(x.tables, t.slug, !on) }))} />
                          <Badge>{l(REASONS[t.reason])}</Badge>
                        </div>
                      ),
                    )}
                  </Section>
                )}

                {(!!s.forms.length || !!s.modules.length) && (
                  <Section title={l({ en: 'Also in the starter', fa: 'همراه الگو' })}>
                    <div className="flex flex-wrap gap-2">
                      {s.forms.map((f) => (
                        <Badge key={f.slug} tone={f.found ? 'neutral' : 'warn'}>
                          {l({ en: 'Form', fa: 'فرم' })}: {l(f.label)}
                        </Badge>
                      ))}
                      {s.modules.map((m) => (
                        <Badge key={m} tone="accent">
                          {l({ en: 'Needs', fa: 'نیاز به' })}: {l(MODULE_NAMES[m] ?? { en: m, fa: m })}
                        </Badge>
                      ))}
                    </div>
                  </Section>
                )}

                <Checkbox
                  label={l({ en: 'With sample data', fa: 'همراه داده‌ی نمونه' })}
                  hint={l({
                    en: `${s.samples.items} items${s.samples.products ? `, ${s.samples.products} products` : ''}, copied with their photos. On a site they are marked as sample data.`,
                    fa: `${s.samples.items} آیتم${s.samples.products ? `، ${s.samples.products} محصول` : ''} با عکس‌هایشان کپی می‌شود. در سایت به‌عنوان داده‌ی نمونه علامت می‌خورند.`,
                  })}
                  checked={samples}
                  onChange={setSamples}
                />
                <p className="text-xs text-ink-soft">
                  {l({
                    en: 'Photos are copied into the studio, so the starter keeps working after this page, table or site is deleted.',
                    fa: 'عکس‌ها در خود استودیو کپی می‌شوند؛ پس الگو بعد از حذف این صفحه، جدول یا حتی سایت هم سالم می‌ماند.',
                  })}
                </p>
              </div>
            )}
          </>
        )}
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {l({ en: 'Cancel', fa: 'انصراف' })}
          </Button>
          <Button type="submit" disabled={!name.trim() || !s || save.isPending}>
            {replace ? l({ en: 'Replace starter', fa: 'جایگزینی الگو' }) : l({ en: 'Save', fa: 'ذخیره' })}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- using ---------- */

type Choice = { action: StarterAction; slug: string; addFields?: boolean };
type Group = 'pages' | 'tables' | 'forms';

export interface ApplyResult {
  pageId: string | null;
  pages: number;
  tables: number;
  forms: number;
  items: number;
  products: number;
  photos: number;
}

const STATE: Record<StarterCheckRow['state'], { label: Lbl; tone: 'good' | 'warn' | 'bad' }> = {
  exists: { label: { en: 'on this site', fa: 'در این سایت هست' }, tone: 'good' },
  differs: { label: { en: 'on this site, with fewer fields', fa: 'هست، ولی فیلدهای کمتری دارد' }, tone: 'warn' },
  missing: { label: { en: 'not on this site', fa: 'در این سایت نیست' }, tone: 'bad' },
};

/**
 * Using a starter on a site: what it holds or needs, how each stands here, and for each a
 * choice (make it from the starter, use the site's own, or leave it out). Applied in one go.
 */
export function ApplyStarterDialog({
  siteId,
  starter,
  page,
  onClose,
  onDone,
}: {
  siteId: string;
  starter: Starter;
  /** The new page's address and title (page starters). */
  page?: { slug: string; title: Lbl };
  onClose: () => void;
  onDone: (result: ApplyResult) => void;
}) {
  const { l } = usePreferences();
  const [choices, setChoices] = useState<Record<Group, Record<string, Choice>>>({ pages: {}, tables: {}, forms: {} });
  const [modules, setModules] = useState(true);
  const [samples, setSamples] = useState(true);
  const check = useQuery({ queryKey: ['site', siteId, 'starter-check', starter.id], queryFn: () => api.get<StarterCheck>(`/sites/${siteId}/starters/${starter.id}/check`) });
  const c = check.data;
  const choice = (group: Group, row: StarterCheckRow): Choice => choices[group][row.slug] ?? { ...row.suggested, addFields: true };
  const setChoice = (group: Group, slug: string, next: Choice) => setChoices((x) => ({ ...x, [group]: { ...x[group], [slug]: next } }));
  const apply = useMutation({
    mutationFn: () => {
      const all = (group: Group) => Object.fromEntries((c?.[group] ?? []).map((row) => [row.slug, choice(group, row)]));
      const body: StarterApply = { ...(page ? { page } : {}), pages: all('pages'), tables: all('tables') as StarterApply['tables'], forms: all('forms'), modules, samples };
      return api.post<ApplyResult>(`/sites/${siteId}/starters/${starter.id}/apply`, body);
    },
    onSuccess: onDone,
  });

  const siteOptions = (group: Group) =>
    group === 'pages' ? (c?.site.pages ?? []).map((p) => ({ value: p.slug, label: `${l(p.title)} (/${p.slug})` })) : group === 'tables' ? (c?.site.tables ?? []).map((t) => ({ value: t.slug, label: `${l(t.name)} (${t.slug})` })) : (c?.site.forms ?? []).map((f) => ({ value: f.slug, label: `${l(f.label)} (${f.slug})` }));

  const rows = (group: Group, title: string) =>
    !!c?.[group].length && (
      <Section title={title}>
        <ul className="divide-y divide-line border border-line">
          {c[group].map((row) => {
            const ch = choice(group, row);
            const options = siteOptions(group);
            const actions: { value: StarterAction; label: string }[] = [
              ...(row.held ? [{ value: 'create' as const, label: l({ en: 'Make it from the starter', fa: 'ساختن از الگو' }) }] : []),
              ...(options.length ? [{ value: 'use' as const, label: l({ en: "Use this site's", fa: 'استفاده از موجودِ سایت' }) }] : []),
              { value: 'skip', label: l({ en: 'Leave it out', fa: 'رد کردن' }) },
            ];
            return (
              <li key={row.slug} className="flex flex-col gap-2 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{l(row.label)}</span>
                  <span className="text-xs text-ink-soft" dir="ltr">
                    {group === 'pages' ? '/' : ''}
                    {row.slug}
                  </span>
                  <Badge tone={STATE[row.state].tone}>{l(STATE[row.state].label)}</Badge>
                  {!row.held && <Badge>{l({ en: 'not in the starter', fa: 'در الگو نیست' })}</Badge>}
                  {!!row.items && (
                    <Badge>
                      {row.items} {l({ en: 'sample items', fa: 'آیتم نمونه' })}
                    </Badge>
                  )}
                </div>
                {row.state === 'differs' && !!row.missingFields?.length && (
                  <p className="text-xs text-ink-soft">
                    {l({ en: 'Missing fields:', fa: 'فیلدهای کم:' })} <span dir="ltr">{row.missingFields.join(', ')}</span>
                  </p>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <SelectField
                    label={l({ en: 'What to do', fa: 'چه کار شود' })}
                    value={ch.action}
                    onChange={(action) => setChoice(group, row.slug, { ...ch, action, slug: action === 'use' ? (options.some((o) => o.value === ch.slug) ? ch.slug : (options[0]?.value ?? '')) : action === 'create' ? row.slug : '' })}
                    options={actions}
                  />
                  {ch.action === 'create' && <TextField label={l({ en: 'Address (slug)', fa: 'نشانی (نامک)' })} dir="ltr" value={ch.slug} onChange={(v) => setChoice(group, row.slug, { ...ch, slug: v.toLowerCase() })} required />}
                  {ch.action === 'use' && <SelectField label={l({ en: 'Which one', fa: 'کدام' })} value={ch.slug} onChange={(v) => setChoice(group, row.slug, { ...ch, slug: v })} options={options} />}
                </div>
                {group === 'tables' && ch.action === 'use' && row.held && (
                  <Checkbox label={l({ en: 'Add the fields it lacks (none are removed)', fa: 'افزودن فیلدهای کم (هیچ فیلدی حذف نمی‌شود)' })} checked={ch.addFields !== false} onChange={(v) => setChoice(group, row.slug, { ...ch, addFields: v })} />
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    );

  return (
    <Modal open onClose={onClose} title={`${l({ en: 'Use starter', fa: 'استفاده از الگو' })}: ${starter.name}`} wide>
      {check.isLoading ? (
        <Spinner />
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            apply.mutate();
          }}
        >
          <ErrorNote error={check.error} />
          {c && (
            <>
              {c.mainPage && page && (
                <p className="text-sm text-ink">
                  {l({ en: 'New page', fa: 'صفحه‌ی جدید' })}: <strong>{l(page.title)}</strong>{' '}
                  <span className="text-ink-soft" dir="ltr">
                    /{page.slug}
                  </span>{' '}
                  · {c.mainPage.sections} {l({ en: 'sections', fa: 'بخش' })}
                </p>
              )}
              {!c.pages.length && !c.tables.length && !c.forms.length && !c.modules.length && <p className="text-sm text-ink-soft">{l({ en: 'This starter needs nothing else.', fa: 'این الگو به چیز دیگری نیاز ندارد.' })}</p>}
              {rows('tables', l({ en: 'Tables', fa: 'جدول‌ها' }))}
              {rows('pages', l({ en: 'Other pages', fa: 'صفحه‌های دیگر' }))}
              {rows('forms', l({ en: 'Forms', fa: 'فرم‌ها' }))}
              {!!c.modules.length && (
                <Checkbox
                  label={`${l({ en: 'Turn on', fa: 'روشن کردن' })}: ${c.modules.map((m) => l(MODULE_NAMES[m] ?? { en: m, fa: m })).join('، ')}`}
                  hint={l({ en: 'The starter uses them; they are off on this site.', fa: 'الگو از آن‌ها استفاده می‌کند و در این سایت خاموش‌اند.' })}
                  checked={modules}
                  onChange={setModules}
                />
              )}
              {(c.samples.items > 0 || c.samples.products > 0) && (
                <Checkbox
                  label={l({ en: 'With sample data', fa: 'همراه داده‌ی نمونه' })}
                  hint={l({
                    en: `${c.samples.items} items${c.samples.products ? `, ${c.samples.products} products` : ''}; removable later with "Sample data".`,
                    fa: `${c.samples.items} آیتم${c.samples.products ? `، ${c.samples.products} محصول` : ''}؛ بعداً با «داده‌ی نمونه» یکجا پاک می‌شوند.`,
                  })}
                  checked={samples}
                  onChange={setSamples}
                />
              )}
            </>
          )}
          <ErrorNote error={apply.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {l({ en: 'Cancel', fa: 'انصراف' })}
            </Button>
            <Button type="submit" disabled={!c || apply.isPending}>
              {apply.isPending ? l({ en: 'Building…', fa: 'در حال ساخت…' }) : l({ en: 'Build', fa: 'ساختن' })}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ---------- preview ---------- */

const DEVICES = [
  { id: 'mobile', width: 390, label: { en: 'Mobile', fa: 'موبایل' } },
  { id: 'tablet', width: 820, label: { en: 'Tablet', fa: 'تبلت' } },
  { id: 'desktop', width: 0, label: { en: 'Desktop', fa: 'دسکتاپ' } },
] as const;

/**
 * A starter as visitors would see it: pages, headers and footers drawn by the site's own
 * components in an iframe (real widths), with the look of a chosen site and the starter's own
 * sample items and photos; tables as their fields and sample items.
 */
export function StarterPreviewDialog({ starter, siteId, onClose }: { starter: Starter; siteId?: string; onClose: () => void }) {
  const { l } = usePreferences();
  return (
    <Modal open onClose={onClose} title={`${l({ en: 'Preview', fa: 'پیش‌نمایش' })}: ${starter.name}`} wide="xl">
      {starter.kind === 'table' ? <TablePreview pack={starter.data} /> : <FramePreview starter={starter} siteId={siteId} />}
    </Modal>
  );
}

function FramePreview({ starter, siteId }: { starter: Starter; siteId?: string }) {
  const { l } = usePreferences();
  const sites = useQuery({ queryKey: ['platform', 'tenants'], queryFn: () => api.get<{ slug: string; name: string; status: string }[]>('/platform/tenants') });
  const active = (sites.data ?? []).filter((s) => s.status === 'active');
  const [look, setLook] = useState(siteId ?? '');
  const lookSite = look || active[0]?.slug || '';
  const pack = starter.data;
  const main = pack.pages.find((p) => p.role === 'main') ?? pack.pages[0];
  const [page, setPage] = useState(main?.slug ?? '');
  const account = JSON.stringify(pack.pages).includes('"page":"account"');
  const signUp = JSON.stringify(main?.document ?? '').includes('"authStart":"signup"') || ['login', 'signup'].includes(main?.slug ?? '');
  const [signedIn, setSignedIn] = useState(!signUp);
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('desktop');
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.source === frame.current?.contentWindow && (e.data as { type?: string })?.type === 'sb:ready') setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    if (!ready || !lookSite) return;
    const msg: StarterPreviewMessage = { type: 'sb:starter', id: starter.id, kind: starter.kind, pack, lookSite, page, signedIn };
    frame.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, [ready, lookSite, page, signedIn, pack, starter.id, starter.kind]);

  const width = DEVICES.find((d) => d.id === device)!.width;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField className="min-w-48" label={l({ en: 'Look of the site', fa: 'ظاهر سایتِ' })} value={lookSite} onChange={setLook} options={active.map((s) => ({ value: s.slug, label: s.name || s.slug }))} />
        {pack.pages.length > 1 && (
          <SelectField className="min-w-48" label={l({ en: 'Page', fa: 'صفحه' })} value={page} onChange={setPage} options={pack.pages.map((p) => ({ value: p.slug, label: `${l(p.title) || p.slug} (/${p.slug})` }))} />
        )}
        <div className="flex gap-1" role="group" aria-label={l({ en: 'Width', fa: 'عرض' })}>
          {DEVICES.map((d) => (
            <Button key={d.id} type="button" size="sm" variant={device === d.id ? 'primary' : 'outline'} onClick={() => setDevice(d.id)}>
              {l(d.label)}
            </Button>
          ))}
        </div>
        {account && <Checkbox label={l({ en: 'Customer signed in', fa: 'مشتری وارد شده' })} checked={signedIn} onChange={setSignedIn} />}
      </div>
      <p className="text-xs text-ink-soft">
        {l({ en: "With the starter's own sample items and photos; links and forms do nothing here.", fa: 'با آیتم‌ها و عکس‌های نمونه‌ی خود الگو؛ لینک‌ها و فرم‌ها در پیش‌نمایش کاری نمی‌کنند.' })}
      </p>
      <div className="overflow-auto rounded-md border border-line bg-surface-2 p-2">
        <iframe ref={frame} title={l({ en: 'Preview', fa: 'پیش‌نمایش' })} src="/__starter-preview" className="mx-auto block h-[70vh] rounded bg-bg" style={{ width: width ? `${width}px` : '100%', maxWidth: '100%' }} />
      </div>
    </div>
  );
}

const FIELD_TYPES: Record<string, Lbl> = {
  text: { en: 'Text', fa: 'متن' },
  textarea: { en: 'Long text', fa: 'متن بلند' },
  number: { en: 'Number', fa: 'عدد' },
  price: { en: 'Price', fa: 'قیمت' },
  date: { en: 'Date', fa: 'تاریخ' },
  datetime: { en: 'Date and time', fa: 'تاریخ و ساعت' },
  boolean: { en: 'Yes / no', fa: 'بله / خیر' },
  select: { en: 'Choice', fa: 'انتخابی' },
  multiselect: { en: 'Several choices', fa: 'چندانتخابی' },
  image: { en: 'Image', fa: 'تصویر' },
  gallery: { en: 'Gallery', fa: 'گالری' },
  link: { en: 'Link', fa: 'لینک' },
  email: { en: 'Email', fa: 'ایمیل' },
  phone: { en: 'Phone', fa: 'تلفن' },
  reference: { en: 'Link to a table', fa: 'ارجاع به جدول' },
};

/** A table starter: each table's fields, then its sample items with their photos. */
function TablePreview({ pack }: { pack: StarterPack }) {
  const { l, formatMoney } = usePreferences();
  const photo = new Map(pack.photos.map((p) => [p.id, p.url]));
  const titles = new Map(
    Object.values(pack.samples.items)
      .flat()
      .map((x) => [x.ref, l(x.title)]),
  );
  const show = (type: string, v: unknown): ReactNode => {
    if (v === null || v === undefined || v === '') return '—';
    if (type === 'image') return typeof v === 'string' && photo.has(v) ? <img src={photo.get(v)} alt="" className="size-12 rounded object-cover" /> : '—';
    if (type === 'gallery') return `${Array.isArray(v) ? v.length : 0} ${l({ en: 'photos', fa: 'عکس' })}`;
    if (type === 'reference')
      return (
        (Array.isArray(v) ? v : [v])
          .map((r) => titles.get(String(r)) ?? '')
          .filter(Boolean)
          .join('، ') || '—'
      );
    if (type === 'price' && typeof v === 'number') return formatMoney(String(v), 'IRR');
    if (typeof v === 'object' && v && 'fa' in v) return l(v as Lbl);
    if (typeof v === 'boolean') return v ? '✓' : '—';
    return String(v);
  };
  return (
    <div className="flex flex-col gap-8">
      {pack.tables.map((t) => {
        const items = pack.samples.items[t.slug] ?? [];
        const shown = t.fields.filter((f) => f.type !== 'textarea').slice(0, 6);
        return (
          <section key={t.slug} className="flex flex-col gap-3">
            <h3 className="font-display text-xl text-ink">
              {l(t.name)}{' '}
              <span className="text-sm text-ink-soft" dir="ltr">
                ({t.slug})
              </span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {t.fields.map((f) => (
                <Badge key={f.key}>
                  {l(f.label) || f.key} · {l(FIELD_TYPES[f.type] ?? { en: f.type, fa: f.type })}
                  {f.type === 'reference' && f.reference ? ` → ${f.reference}` : ''}
                </Badge>
              ))}
              {t.commerce.enabled && <Badge tone="accent">{l({ en: 'Sells', fa: 'فروش' })}</Badge>}
            </div>
            {items.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-ink-soft">
                      <th className="px-2 py-2 text-start font-medium">{l({ en: 'Title', fa: 'عنوان' })}</th>
                      {shown.map((f) => (
                        <th key={f.key} className="px-2 py-2 text-start font-medium">
                          {l(f.label) || f.key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {items.map((it) => (
                      <tr key={it.ref}>
                        <td className="px-2 py-2 font-medium text-ink">{l(it.title)}</td>
                        {shown.map((f) => (
                          <td key={f.key} className="px-2 py-2 align-middle text-ink-soft">
                            {show(f.type, it.data[f.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">{l({ en: 'No sample items.', fa: 'بدون آیتم نمونه.' })}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ---------- header and footer ---------- */

/** In Settings ← Header / Footer: save the site's own as a starter, or put one in its place. */
export function ChromeStarters({ siteId, kind }: { siteId: string; kind: 'header' | 'footer' }) {
  const { l } = usePreferences();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useStarters(kind);
  const [chosen, setChosen] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const starter = list.data?.find((s) => s.id === chosen);
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-line p-3">
      <StarterSelect
        className="min-w-56 flex-1"
        label={kind === 'header' ? l({ en: 'Ready-made headers', fa: 'هدرهای آماده' }) : l({ en: 'Ready-made footers', fa: 'فوترهای آماده' })}
        value={chosen}
        onChange={setChosen}
        list={list.data ?? []}
        empty={l({ en: 'Choose…', fa: 'انتخاب کنید…' })}
      />
      {starter && (
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => setPreview(true)}>
            {l({ en: 'Preview', fa: 'پیش‌نمایش' })}
          </Button>
          <Button type="button" size="sm" onClick={() => setApplying(true)}>
            {l({ en: 'Use it', fa: 'استفاده' })}
          </Button>
        </>
      )}
      <Button type="button" size="sm" variant="ghost" onClick={() => setSaving(true)}>
        {l({ en: 'Save as starter', fa: 'ذخیره به‌عنوان الگو' })}
      </Button>
      {saving && <SaveStarterDialog siteId={siteId} kind={kind} slug="" name={kind === 'header' ? l({ en: 'Header', fa: 'هدر' }) : l({ en: 'Footer', fa: 'فوتر' })} onClose={() => setSaving(false)} />}
      {preview && starter && <StarterPreviewDialog starter={starter} siteId={siteId} onClose={() => setPreview(false)} />}
      {applying && starter && (
        <ApplyStarterDialog
          siteId={siteId}
          starter={starter}
          onClose={() => setApplying(false)}
          onDone={() => {
            setApplying(false);
            qc.invalidateQueries({ queryKey: ['site', siteId] });
            qc.invalidateQueries({ queryKey: ['public'] });
            toast(l({ en: 'Done', fa: 'انجام شد' }));
          }}
        />
      )}
    </div>
  );
}
