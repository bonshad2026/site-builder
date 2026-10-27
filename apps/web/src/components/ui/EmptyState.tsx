import { Button } from './Button';

export function EmptyState({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div role="status" className="flex flex-col items-center gap-6 border border-dashed border-line px-6 py-20 text-center">
      <p className="font-display text-2xl text-ink-soft">{message}</p>
      {actionLabel && onAction && (
        <Button variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
