import { useRef, useState, type ChangeEvent } from "react";
import { BookOpen, CircleAlert, FileText, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MESSAGES } from "./CaptureBar";
import { useReplaceGuard } from "./useReplaceGuard";
import { saveBook } from "../lib/book-assets";
import { fileToBlock, type FileFailure } from "../lib/document";
import { parseEpub, type EpubFailure } from "../lib/epub";
import { saveDocument } from "../lib/storage";

const FILE_MESSAGES: Record<FileFailure, string> = {
  unsupported: "Formato não suportado",
  empty: "Arquivo vazio",
  tooLarge: "Arquivo grande demais (limite de 500.000 caracteres)",
};

const EPUB_MESSAGES: Record<EpubFailure, string> = {
  invalid: "EPUB inválido",
  drm: "EPUB protegido por DRM não é suportado",
  empty: "Arquivo vazio",
};

interface NewDocumentMenuProps {
  /** Called once the imported document is in the buffer. */
  onOpened: () => void;
}

export default function NewDocumentMenu({ onOpened }: NewDocumentMenuProps) {
  const input = useRef<HTMLInputElement>(null);
  const epubInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const guard = useReplaceGuard();

  async function pick(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    event.target.value = "";
    if (!file) return;
    setMessage(null);
    const result = fileToBlock(
      file.name,
      await file.text(),
      navigator.language,
    );
    if (!result.ok) {
      setMessage(FILE_MESSAGES[result.reason]);
      return;
    }
    await guard.open([result.block], onOpened);
  }

  async function pickEpub(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = parseEpub(bytes, file.name, navigator.language);
    if (!result.ok) {
      setMessage(EPUB_MESSAGES[result.reason]);
      return;
    }
    // The file itself is kept aside first: without it the chapters cannot be rendered.
    if (!(await saveBook(result.doc.id, bytes))) {
      setMessage(MESSAGES.quota);
      return;
    }
    // The book lands in the library first, so Cancel in the dialog still keeps it.
    if (!(await saveDocument(result.doc)).ok) {
      setMessage(MESSAGES.quota);
      return;
    }
    await guard.open(result.doc.blocks, onOpened);
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
      <input
        ref={epubInput}
        type="file"
        accept=".epub"
        hidden
        onChange={(event) => void pickEpub(event)}
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
          <DropdownMenuItem onSelect={() => epubInput.current?.click()}>
            <BookOpen />
            <div className="flex flex-col">
              <span>Livro</span>
              <span className="text-xs text-muted-foreground">EPUB</span>
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
