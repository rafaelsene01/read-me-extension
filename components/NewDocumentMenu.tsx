import { useRef, useState, type ChangeEvent } from 'react';
import { CircleAlert, FileText, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useReplaceGuard } from './useReplaceGuard';
import { fileToBlock, type FileFailure } from '../lib/document';

const FILE_MESSAGES: Record<FileFailure, string> = {
  unsupported: 'Formato não suportado',
  empty: 'Arquivo vazio',
  tooLarge: 'Arquivo grande demais (limite de 500.000 caracteres)',
};

interface NewDocumentMenuProps {
  /** Called once the imported document is in the buffer. */
  onOpened: () => void;
}

export default function NewDocumentMenu({ onOpened }: NewDocumentMenuProps) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const guard = useReplaceGuard();

  async function pick(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    event.target.value = '';
    if (!file) return;
    setMessage(null);
    const result = fileToBlock(file.name, await file.text(), navigator.language);
    if (!result.ok) {
      setMessage(FILE_MESSAGES[result.reason]);
      return;
    }
    await guard.open([result.block], onOpened);
  }

  const error = message ?? guard.error;

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept=".txt,.md"
        hidden
        onChange={(event) => void pick(event)}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="w-full justify-start">
            <Plus />
            Novo
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={() => input.current?.click()}>
            <FileText />
            <div className="flex flex-col">
              <span>Documentos</span>
              <span className="text-xs text-muted-foreground">TXT, MD</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {guard.dialog}
    </div>
  );
}
