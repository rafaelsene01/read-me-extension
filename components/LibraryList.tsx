import { useEffect, useState } from 'react';
import { CircleAlert, FileText, Library, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useReplaceGuard } from './useReplaceGuard';
import { deleteBook } from '../lib/book-assets';
import type { LibraryDocument } from '../lib/document';
import { deleteDocument, getDocuments } from '../lib/storage';

interface LibraryListProps {
  /** Runs after the chosen document replaced the buffer (e.g. select the Arquivo tab). */
  onOpened: () => void;
}

export default function LibraryList({ onOpened }: LibraryListProps) {
  const [docs, setDocs] = useState<LibraryDocument[]>([]);
  const [pendingDelete, setPendingDelete] = useState<LibraryDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guard = useReplaceGuard();

  useEffect(() => {
    const load = (): void => {
      void getDocuments().then(setDocs);
    };
    load();
    // Saves happen from other views too, so follow the store.
    chrome.storage.local.onChanged.addListener(load);
    return () => chrome.storage.local.onChanged.removeListener(load);
  }, []);

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    const doc = pendingDelete;
    setPendingDelete(null);
    setError(null);
    if (!(await deleteDocument(doc.id)).ok) {
      // Nothing was written: the item is still in the library.
      setError('Falha ao excluir');
      return;
    }
    // A no-op when the document is not a book.
    await deleteBook(doc.id);
  }

  const message = guard.error ?? error;

  return (
    <div className="flex flex-col gap-3">
      {message && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <Library className="size-8 opacity-60" />
          <p>Nenhum documento salvo.</p>
        </div>
      ) : (
        <Card className="gap-0 py-1">
          <ul>
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-center pr-2">
                <Button
                  variant="ghost"
                  className="h-auto min-w-0 flex-1 flex-row items-center gap-3 rounded-none px-4 py-2 text-left"
                  onClick={() => void guard.open(doc.blocks, onOpened)}
                >
                  {doc.cover ? (
                    <img
                      src={doc.cover}
                      alt=""
                      className="h-16 w-12 shrink-0 rounded-sm object-cover"
                    />
                  ) : (
                    <FileText className="h-16 w-12 shrink-0 rounded-sm px-2 text-muted-foreground" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span className="w-full truncate font-medium">{doc.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {new Date(doc.savedAt).toLocaleString()}
                    </span>
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Excluir"
                  onClick={() => setPendingDelete(doc)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {guard.dialog}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(isOpen) => !isOpen && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir documento?</DialogTitle>
            <DialogDescription>
              "{pendingDelete?.name}" será removido da biblioteca.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
