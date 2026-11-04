import { isSectionType, normalizedProps } from '@site-builder/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import type { Localized } from '../../types/site';
import { sectionMeta } from '../builder/fields';
import { FieldsEditor } from '../builder/Inspector';
import { useT } from '../i18n';
import { Badge, Card, ErrorNote, PageTitle, Spinner, Table, Td, useToast } from '../ui';

interface Section {
  id: string;
  type: string;
  hidden?: boolean;
  props: Record<string, unknown>;
}
interface PageRow {
  id: string;
  slug: string;
  title: Localized;
  isHome: boolean;
  isPublished: boolean;
  hasUnpublishedChanges: boolean;
}
interface PageDetail extends PageRow {
  document: { schemaVersion: 1; sections: Section[] };
}

const pagesKey = (siteId: string) => ['site', siteId, 'pages'];

/**
 * A client's page content: the text and images of the sections the operator built.
 * Sections, their order, links and layout are not editable here (the API enforces it too).
 */
function ContentList({ siteId }: { siteId: string }) {
  const t = useT();
  const { l } = usePreferences();
  const { data, isLoading, error } = useQuery({ queryKey: pagesKey(siteId), queryFn: () => api.get<PageRow[]>(`/sites/${siteId}/pages`) });
  if (isLoading) return <Spinner />;
  return (
    <>
      <PageTitle title={t.content} subtitle={t.contentHint} />
      <ErrorNote error={error} />
      <Table head={[t.title, t.status, '']}>
        {(data ?? []).map((p) => (
          <tr key={p.id}>
            <Td>
              {l(p.title)} <span className="text-xs text-ink-soft">/{p.isHome ? '' : p.slug}</span>
            </Td>
            <Td>{p.hasUnpublishedChanges ? <Badge tone="warn">{t.draft}</Badge> : <Badge tone="good">{t.published}</Badge>}</Td>
            <Td className="text-end">
              <Link to={p.id} className="text-sm underline underline-offset-4">
                {t.edit}
              </Link>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function ContentEditor({ siteId }: { siteId: string }) {
  const { pageId = '' } = useParams();
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { locale, l } = usePreferences();
  const { data: page, isLoading, error } = useQuery({ queryKey: [...pagesKey(siteId), pageId], queryFn: () => api.get<PageDetail>(`/sites/${siteId}/pages/${pageId}`) });
  const [sections, setSections] = useState<Section[] | null>(null);
  useEffect(() => setSections(page ? page.document.sections.map((s) => ({ ...s, props: normalizedProps(s.type, s.props) })) : null), [page]);

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      let saved = await api.patch<PageDetail>(`/sites/${siteId}/pages/${pageId}`, { document: { schemaVersion: 1, sections } });
      if (publish) saved = await api.post<PageDetail>(`/sites/${siteId}/pages/${pageId}/publish`);
      return { saved, publish };
    },
    onSuccess: ({ saved, publish }) => {
      qc.setQueryData([...pagesKey(siteId), pageId], saved);
      qc.invalidateQueries({ queryKey: pagesKey(siteId), exact: true });
      qc.invalidateQueries({ queryKey: ['public'] });
      toast(publish ? t.contentPublished : t.saved);
    },
  });

  if (isLoading || !sections) return error ? <ErrorNote error={error} /> : <Spinner />;
  const update = (i: number, props: Record<string, unknown>) => setSections(sections.map((s, j) => (j === i ? { ...s, props } : s)));
  return (
    <>
      <PageTitle
        title={l(page!.title)}
        subtitle={t.contentHint}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => save.mutate(false)} disabled={save.isPending}>
              {t.save}
            </Button>
            <Button size="sm" onClick={() => save.mutate(true)} disabled={save.isPending}>
              {save.isPending ? t.saving : t.publish}
            </Button>
          </div>
        }
      />
      <ErrorNote error={save.error} />
      <div className="flex max-w-3xl flex-col gap-6">
        {sections.map((s, i) => {
          if (s.hidden || !isSectionType(s.type)) return null;
          const meta = sectionMeta[s.type];
          return (
            <Card key={s.id} title={meta.label[locale]}>
              <FieldsEditor fields={meta.fields} value={s.props} onChange={(p) => update(i, p)} siteId={siteId} contentOnly />
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-sm">
        <Link to=".." relative="path" className="underline underline-offset-4">
          {t.content}
        </Link>
      </p>
    </>
  );
}

export default function ContentPages({ siteId }: { siteId: string }) {
  return (
    <Routes>
      <Route index element={<ContentList siteId={siteId} />} />
      <Route path=":pageId" element={<ContentEditor siteId={siteId} />} />
    </Routes>
  );
}
