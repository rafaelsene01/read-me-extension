import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * The mark shown while a document is being read in: the lines of a page
 * lighting up one after the other, like the sentence being spoken. Decorative,
 * so it carries no text of its own — the label next to it does.
 */
export function LoadingMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('flex w-16 flex-col gap-1.5', className)}>
      <span className="h-1.5 origin-left rounded-full bg-primary animate-reading" />
      <span className="h-1.5 w-4/5 origin-left rounded-full bg-primary animate-reading [animation-delay:180ms]" />
      <span className="h-1.5 w-3/5 origin-left rounded-full bg-primary animate-reading [animation-delay:360ms]" />
    </span>
  );
}

/**
 * Covers the whole window while a document is being opened, so nothing else can
 * be clicked in the middle of it. A Dialog and not a plain fixed layer: it
 * takes the focus with it and puts it back, and the page behind it is inert.
 * It cannot be dismissed — the wait ends when the document is in.
 */
export default function LoadingOverlay({ open, label }: { open: boolean; label: string }) {
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        // Nothing to cancel: closing it would only hide that the work is still running.
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="max-w-xs justify-items-center gap-5 py-8 sm:max-w-xs"
      >
        <LoadingMark />
        <DialogTitle className="font-serif text-base font-medium">{label}</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}
