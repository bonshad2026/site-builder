import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { api, apiRequest, uploadFile } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useT } from '../i18n';
import { Badge, ErrorNote, Modal, PageTitle, Pagination, SelectField, Spinner, useToast } from '../ui';

export interface Asset {
  id: string;
  storageKey: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  visibility: 'public' | 'private';
  kind: 'image' | 'document';
  url: string;
  createdAt: string;
}

const assetsKey = (siteId: string) => ['site', siteId, 'assets'];

export function useAssets(siteId: string, page = 1) {
  return useQuery({
    queryKey: [...assetsKey(siteId), page],
    queryFn: () => apiRequest<Asset[]>(`/sites/${siteId}/assets?page=${page}&pageSize=24`),
    placeholderData: keepPreviousData,
  });
}

/** Upload button with a real progress bar (XHR upload events). */
export function UploadButton({ siteId, onUploaded, visibility = 'public' }: { siteId: string; onUploaded?: (a: Asset) => void; visibility?: 'public' | 'private' }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const upload = async (file: File) => {
    const form = new FormData();
    form.append('visibility', visibility);
    form.append('file', file);
    setProgress(0);
    try {
      const asset = await uploadFile<Asset>(`/sites/${siteId}/assets`, form, setProgress);
      qc.invalidateQueries({ queryKey: assetsKey(siteId) });
      onUploaded?.(asset);
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,application/pdf" className="sr-only" id={`upload-${siteId}`} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <Button size="sm" onClick={() => input.current?.click()} disabled={progress !== null}>
        {progress === null ? t.upload : `${t.uploading} ${Math.round(progress * 100)}%`}
      </Button>
      {progress !== null && (
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/** Choose an uploaded image (or upload a new one). Returns its id and URL. */
export function ImagePicker({ siteId, value, onChange, label }: { siteId: string; value: string; onChange: (url: string, asset?: Asset) => void; label: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const { data } = useAssets(siteId, page);
  const images = (data?.data ?? []).filter((a) => a.kind === 'image' && a.visibility === 'public');

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      <div className="flex items-center gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded-md border border-line bg-surface-2">{value && <img src={value} alt="" className="h-full w-full object-cover" />}</div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {t.chooseImage}
        </Button>
        {value && (
          <Button size="sm" variant="ghost" onClick={() => onChange('')}>
            {t.removeImage}
          </Button>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t.chooseImage} wide>
        <div className="mb-4">
          <UploadButton
            siteId={siteId}
            onUploaded={(a) => {
              if (a.kind === 'image') {
                onChange(a.url, a);
                setOpen(false);
              }
            }}
          />
        </div>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {images.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(a.url, a);
                  setOpen(false);
                }}
                className={`block aspect-square w-full overflow-hidden rounded-md border-2 ${value === a.url ? 'border-accent' : 'border-transparent hover:border-line'}`}
                aria-label={a.originalName}
              >
                <img src={a.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
        <Pagination page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={setPage} />
      </Modal>
    </div>
  );
}

export default function FilesPage({ siteId }: { siteId: string }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { format } = usePreferences();
  const [page, setPage] = useState(1);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [unused, setUnused] = useState<string[] | null>(null);
  const { data, isLoading, error } = useAssets(siteId, page);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/sites/${siteId}/assets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: assetsKey(siteId) }),
    onError: (e) => toast(e.message, 'bad'),
  });
  const scan = useMutation({
    mutationFn: (dryRun: boolean) => api.post<{ unused: string[]; deleted: number }>(`/sites/${siteId}/assets/cleanup?dryRun=${dryRun}`),
    onSuccess: (r, dryRun) => {
      if (dryRun) setUnused(r.unused);
      else {
        setUnused(null);
        toast(`${t.deleteUnused}: ${r.deleted}`);
        qc.invalidateQueries({ queryKey: assetsKey(siteId) });
      }
    },
  });

  return (
    <>
      <PageTitle
        title={t.files}
        subtitle={t.dropHint}
        actions={
          <>
            <SelectField label={t.visibility} value={visibility} onChange={setVisibility} options={[{ value: 'public', label: t.public }, { value: 'private', label: t.private }]} />
            <div className="self-end">
              <UploadButton siteId={siteId} visibility={visibility} />
            </div>
          </>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => scan.mutate(true)}>
          {t.cleanup}
        </Button>
        {unused && (
          <>
            <span className="text-sm text-ink-soft">{format(t.unusedFound, { count: unused.length })}</span>
            {unused.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => window.confirm(t.confirmDelete) && scan.mutate(false)}>
                {t.deleteUnused}
              </Button>
            )}
          </>
        )}
      </div>
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <ErrorNote error={error} />
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data?.data.map((a) => (
              <li key={a.id} className="border border-line bg-surface">
                <div className="aspect-[4/3] overflow-hidden bg-surface-2">
                  {a.kind === 'image' ? <img src={a.url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-ink-soft">PDF</div>}
                </div>
                <div className="flex flex-col gap-2 p-3 text-xs">
                  <span className="truncate font-medium text-ink" title={a.originalName}>
                    {a.originalName}
                  </span>
                  <span className="flex items-center gap-2 text-ink-soft">
                    <Badge tone={a.visibility === 'public' ? 'neutral' : 'warn'}>{a.visibility === 'public' ? t.public : t.private}</Badge>
                    {(a.sizeBytes / 1024).toFixed(0)} KB
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="text-ink-soft hover:text-ink"
                      onClick={() => navigator.clipboard?.writeText(a.url).then(() => toast(t.copied))}
                    >
                      {t.copyUrl}
                    </button>
                    <button type="button" className="text-ink-soft hover:text-danger" onClick={() => window.confirm(t.confirmDelete) && remove.mutate(a.id)}>
                      {t.delete}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={setPage} />
        </>
      )}
    </>
  );
}
