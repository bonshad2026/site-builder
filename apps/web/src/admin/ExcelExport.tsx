import { useMutation } from '@tanstack/react-query';
import { Button } from '../components/ui/Button';
import { apiRequest } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import { downloadXlsx, type Cell } from '../lib/xlsx';
import { useErrorLine, useToast } from './ui';

/** Every row of a paged admin list (`path` without page / pageSize), page by page. */
export async function fetchAll<T>(path: string, pageSize = 100): Promise<T[]> {
  const out: T[] = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let page = 1; page <= 500; page++) {
    const res = await apiRequest<T[]>(`${path}${sep}page=${page}&pageSize=${pageSize}`);
    out.push(...res.data);
    const total = res.meta?.totalPages as number | undefined;
    if (total !== undefined ? page >= total : res.data.length < pageSize) break;
  }
  return out;
}

/** Rows a paged list holds (all pages), or undefined while it loads. */
export const listTotal = (res: { data: unknown[]; meta?: Record<string, unknown> } | undefined) => (res ? ((res.meta?.total as number | undefined) ?? res.data.length) : undefined);

/** A date as the admin reads it (local date and time). */
export const excelDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('sv-SE').slice(0, 16) : '');

/**
 * "Excel export" button for a list: `rows` loads everything and returns the sheet (header row
 * first); the file is named after the list and the day. Hidden while the list is empty (`count`).
 */
export function ExcelButton({ name, rows, count, size = 'md' }: { name: string; rows: () => Promise<Cell[][]>; count: number | undefined; size?: 'sm' | 'md' }) {
  const { locale } = usePreferences();
  const toast = useToast();
  const errorText = useErrorLine();
  const run = useMutation({
    mutationFn: rows,
    onSuccess: (data) => {
      const day = new Date().toISOString().slice(0, 10);
      const safe = name.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'export';
      downloadXlsx(`${safe}-${day}.xlsx`, data, { sheet: safe, rtl: locale === 'fa' });
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });
  if (!count) return null;
  return (
    <Button variant="outline" size={size} disabled={run.isPending} onClick={() => run.mutate()}>
      {run.isPending ? '…' : locale === 'fa' ? 'خروجی اکسل' : 'Export to Excel'}
    </Button>
  );
}
