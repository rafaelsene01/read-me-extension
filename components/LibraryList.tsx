import { useEffect, useState } from 'react';
import { CircleAlert, Library } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useReplaceGuard } from './useReplaceGuard';
import type { LibraryDocument } from '../lib/document';
import { getDocuments } from '../lib/storage';

interface LibraryListProps {
  /** Runs after the chosen document replaced the buffer (e.g. select the Arquivo tab). */
  onOpened: () => void;
}

export default function LibraryList({ onOpened }: LibraryListProps) {
  const [docs, setDocs] = useState<LibraryDocument[]>([]);
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

  return (
    <div className="flex flex-col gap-3">
      {guard.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{guard.error}</AlertDescription>
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
              <li key={doc.id}>
                <Button
                  variant="ghost"
                  className="h-auto w-full flex-col items-start gap-0.5 rounded-none px-4 py-2 text-left"
                  onClick={() => void guard.open(doc.blocks, onOpened)}
                >
                  <span className="w-full truncate font-medium">{doc.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {new Date(doc.savedAt).toLocaleString()}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {guard.dialog}
    </div>
  );
}
