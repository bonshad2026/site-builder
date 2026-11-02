import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useT } from '../i18n';
import { Badge, Card, Checkbox, ErrorNote, PageTitle, Spinner, TextField, useToast } from '../ui';

type Text = { en: string; fa: string };

/** A gateway in the studio catalog: its driver plus the studio's choices for it. */
interface CatalogGateway {
  key: string;
  name: Text;
  testMode: 'toggle' | 'auto' | 'always';
  available: boolean;
  enabled: boolean;
  defaultAllowed: boolean;
  label: Text;
  description: Text;
}

function CatalogCard({ gateway, onSaved }: { gateway: CatalogGateway; onSaved: (list: CatalogGateway[]) => void }) {
  const t = useT();
  const p = t.pg;
  const toast = useToast();
  const { l } = usePreferences();
  const [form, setForm] = useState(gateway);
  useEffect(() => setForm(gateway), [gateway]);
  const save = useMutation({
    mutationFn: () => api.put<CatalogGateway[]>(`/platform/payment-gateways/${gateway.key}`, { enabled: form.enabled, defaultAllowed: form.defaultAllowed, label: form.label, description: form.description }),
    onSuccess: (list) => {
      onSaved(list);
      toast(t.saved);
    },
  });
  const text = (key: 'label' | 'description', lang: 'en' | 'fa', v: string) => setForm({ ...form, [key]: { ...form[key], [lang]: v } });
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-medium text-ink">{l(gateway.name)}</h2>
        <span className="font-mono text-xs text-ink-soft" dir="ltr">
          {gateway.key}
        </span>
        {gateway.enabled ? <Badge tone="good">{p.on}</Badge> : <Badge>{p.off}</Badge>}
        {gateway.testMode === 'always' && <Badge tone="accent">{p.testBadge}</Badge>}
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {!gateway.available && <p className="text-sm text-danger">{p.unavailable}</p>}
        <Checkbox label={p.catalogEnabled} hint={p.catalogEnabledHint} checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} />
        <Checkbox label={p.defaultAllowed} hint={p.defaultAllowedHint} checked={form.defaultAllowed} onChange={(defaultAllowed) => setForm({ ...form, defaultAllowed })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={`${p.label} (فارسی)`} value={form.label.fa} hint={p.labelHint} onChange={(v) => text('label', 'fa', v)} />
          <TextField label={`${p.label} (English)`} dir="ltr" value={form.label.en} hint={p.labelHint} onChange={(v) => text('label', 'en', v)} />
          <TextField label={`${p.description} (فارسی)`} value={form.description.fa} onChange={(v) => text('description', 'fa', v)} />
          <TextField label={`${p.description} (English)`} dir="ltr" value={form.description.en} onChange={(v) => text('description', 'en', v)} />
        </div>
        <ErrorNote error={save.error} />
        <div>
          <Button type="submit" disabled={save.isPending}>
            {t.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Studio: the gateways sites can be given, and what a new site starts with. */
export default function PaymentCatalogPage() {
  const t = useT();
  const qc = useQueryClient();
  const key = ['platform', 'payment-gateways'];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => api.get<CatalogGateway[]>('/platform/payment-gateways') });
  if (isLoading || !data) return error ? <ErrorNote error={error} /> : <Spinner />;
  return (
    <>
      <PageTitle title={t.pg.catalog} subtitle={t.pg.catalogNote} />
      <div className="flex max-w-3xl flex-col gap-5">
        {data.map((g) => (
          <CatalogCard key={g.key} gateway={g} onSaved={(list) => qc.setQueryData(key, list)} />
        ))}
      </div>
    </>
  );
}
