import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MESSAGES } from './CaptureBar';
import { toLibraryDocument } from '../lib/document';
import { getBlocks, saveDocument, setBlocks } from '../lib/storage';
import type { Block } from '../lib/types';

interface Pending {
  blocks: Block[];
  onOpened?: () => void;
}

/**
 * Single gate for every "open document" path: writes straight to an empty
 * buffer, otherwise asks before replacing it. Callers render `dialog` and show
 * `error` (quota) in an Alert.
 */
export function useReplaceGuard(): {
  open: (blocks: Block[], onOpened?: () => void) => Promise<void>;
  dialog: ReactNode;
  error: string | null;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function replace(blocks: Block[], onOpened?: () => void): Promise<void> {
    const result = await setBlocks(blocks);
    if (!result.ok) {
      setError(MESSAGES.quota);
      return;
    }
    onOpened?.();
  }

  async function open(blocks: Block[], onOpened?: () => void): Promise<void> {
    setError(null);
    // Read here, not from props, so the check always sees the stored buffer.
    const current = await getBlocks();
    if (current.length === 0) {
      await replace(blocks, onOpened);
      return;
    }
    setPending({ blocks, onOpened });
  }

  async function confirm(save: boolean): Promise<void> {
    if (!pending) return;
    setPending(null);
    // The buffer may have been cleared while the dialog was open: nothing to save.
    const current = save ? await getBlocks() : [];
    if (current.length > 0 && !(await saveDocument(toLibraryDocument(current))).ok) {
      // Save failed: keep the buffer as it is.
      setError(MESSAGES.quota);
      return;
    }
    await replace(pending.blocks, pending.onOpened);
  }

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(isOpen) => !isOpen && setPending(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Substituir o conteúdo atual?</DialogTitle>
          <DialogDescription>
            O leitor já tem conteúdo. Ele será substituído pelo documento.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPending(null)}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={() => void confirm(false)}>
            Substituir
          </Button>
          <Button onClick={() => void confirm(true)}>Salvar e substituir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { open, dialog, error };
}
