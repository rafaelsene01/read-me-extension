import { useState } from 'react';
import { MESSAGES } from './CaptureBar';
import { toLibraryDocument } from '../lib/document';
import { getBlocks, saveDocument, setBlocks, touchDocument } from '../lib/storage';
import type { Block } from '../lib/types';

/**
 * Single gate for every "open document" path: files what the buffer is holding
 * in the library, then puts the new document in its place. Nothing is asked,
 * because nothing is lost — a document that came from the library is already
 * kept up to date by setBlocks, and a buffer that never was one is saved here
 * before it is replaced. Callers show `error` (quota) in an Alert.
 */
export function useReplaceGuard(): {
  open: (blocks: Block[], onOpened?: () => void) => Promise<void>;
  /** True while a document is being filed and put in the buffer: show it. */
  opening: boolean;
  error: string | null;
} {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  async function open(blocks: Block[], onOpened?: () => void): Promise<void> {
    setError(null);
    setOpening(true);
    try {
      // Read here, not from props, so it always sees the stored buffer.
      const current = await getBlocks();
      if (current.length > 0 && current[0]!.id !== blocks[0]!.id) {
        if (!(await saveDocument(toLibraryDocument(current))).ok) {
          // The buffer could not be filed: keep it instead of dropping it.
          setError(MESSAGES.quota);
          return;
        }
      }

      if (!(await setBlocks(blocks)).ok) {
        setError(MESSAGES.quota);
        return;
      }

      // Opening is what the library orders by: the document being read is the
      // most recent one.
      await touchDocument(blocks[0]!.id);

      // The cursor is not set here: the engine sees the new buffer and puts the
      // reading back where this document was left, which is also what gets
      // broadcast to the panel.
      onOpened?.();
    } finally {
      setOpening(false);
    }
  }

  return { open, opening, error };
}
