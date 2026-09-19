import { useState } from 'react';
import { CircleAlert, Save, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { MESSAGES } from './CaptureBar';
import Mp3Button from './Mp3Button';
import { toLibraryDocument } from '../lib/document';
import { sendCommand } from '../lib/messages';
import { clearBlocks, saveDocument } from '../lib/storage';
import type { Block, Prefs } from '../lib/types';

interface DocumentActionsProps {
  blocks: Block[];
  prefs: Prefs;
}

export default function DocumentActions({ blocks, prefs }: DocumentActionsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const empty = blocks.length === 0;

  async function save(): Promise<void> {
    setMessage(null);
    const result = await saveDocument(toLibraryDocument(blocks));
    if (!result.ok) setMessage(MESSAGES.quota);
  }

  async function clear(): Promise<void> {
    setMessage(null);
    await sendCommand({ type: 'stop' });
    await clearBlocks();
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-2">
        <Button variant="outline" disabled={empty} onClick={() => void save()}>
          <Save />
          Salvar
        </Button>
        <Mp3Button blocks={blocks} prefs={prefs} />
        <Button variant="outline" disabled={empty} onClick={() => void clear()}>
          <Trash2 />
          Limpar
        </Button>
      </div>

      {message && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
