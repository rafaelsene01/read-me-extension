import { useRef, useState, type ChangeEvent } from "react";
import { CircleAlert, FileText, Plus, Type } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MESSAGES } from "./CaptureBar";
import LoadingOverlay from "./LoadingOverlay";
import { useReplaceGuard } from "./useReplaceGuard";
import { saveBook } from "../lib/book-assets";
import { detectLang } from "../lib/detect-lang";
import {
  emptyTextBlock,
  fileToBlock,
  type FileFailure,
  type LibraryDocument,
} from "../lib/document";
import { parseDocx, type DocxFailure } from "../lib/docx";
import { parseEpub, type EpubFailure } from "../lib/epub";
import type { PdfFailure } from "../lib/pdf";
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

const DOCX_MESSAGES: Record<DocxFailure, string> = {
  invalid: "DOC inválido",
  legacy: "DOC do Word 97-2003 não é suportado: salve como .docx",
  empty: "Documento sem texto",
};

const PDF_MESSAGES: Record<PdfFailure, string> = {
  invalid: "PDF inválido",
  encrypted: "PDF protegido por senha não é suportado",
  empty: "PDF sem texto: um PDF digitalizado precisa de OCR",
};

/** Everything the importer reads, behind one file picker. */
const ACCEPT = ".pdf,.epub,.doc,.docx,.txt,.md";

interface NewDocumentMenuProps {
  /** Called once the imported document is in the buffer. */
  onOpened: () => void;
  /** Called when a blank document was opened to be typed into. */
  onCompose: () => void;
}

export default function NewDocumentMenu({ onOpened, onCompose }: NewDocumentMenuProps) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Reading a PDF or an EPUB takes seconds: the menu says so instead of looking stuck.
  const [busy, setBusy] = useState(false);
  const guard = useReplaceGuard();

  async function openText(name: string, raw: string): Promise<void> {
    // The file declares no language; the browser's is not the text's.
    const result = fileToBlock(name, raw, await detectLang(raw, navigator.language));
    if (!result.ok) {
      setMessage(FILE_MESSAGES[result.reason]);
      return;
    }
    await guard.open([result.block], onOpened);
  }

  /** Shared tail of EPUB and PDF: the file is kept aside, then the document. */
  async function openBook(bytes: Uint8Array<ArrayBuffer>, doc: LibraryDocument): Promise<void> {
    // Without the file the chapters and pages cannot be rendered.
    if (!(await saveBook(doc.id, bytes))) {
      setMessage(MESSAGES.quota);
      return;
    }
    // The document lands in the library first, so Cancel in the dialog still keeps it.
    if (!(await saveDocument(doc)).ok) {
      setMessage(MESSAGES.quota);
      return;
    }
    await guard.open(doc.blocks, onOpened);
  }

  async function pick(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    event.target.value = "";
    if (!file) return;
    setMessage(null);
    setBusy(true);
    try {
      await read(file);
    } finally {
      setBusy(false);
    }
  }

  async function read(file: File): Promise<void> {
    const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    if (extension === "pdf" || extension === "epub") {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result =
        extension === "pdf"
          ? // pdf.js is fetched when a PDF is picked, not when the menu is opened.
            await (await import("../lib/pdf")).parsePdf(bytes, file.name, navigator.language)
          : parseEpub(bytes, file.name, navigator.language);
      if (!result.ok) {
        setMessage(
          extension === "pdf"
            ? PDF_MESSAGES[result.reason as PdfFailure]
            : EPUB_MESSAGES[result.reason as EpubFailure],
        );
        return;
      }
      await openBook(bytes, result.doc);
      return;
    }

    // Both extensions are picked, but only the .docx zip can be read.
    if (extension === "doc" || extension === "docx") {
      const result = parseDocx(new Uint8Array(await file.arrayBuffer()));
      if (!result.ok) {
        setMessage(DOCX_MESSAGES[result.reason]);
        return;
      }
      await openText(file.name, result.text);
      return;
    }

    await openText(file.name, await file.text());
  }

  async function compose(): Promise<void> {
    setMessage(null);
    setBusy(true);
    try {
      await guard.open([emptyTextBlock(navigator.language)], onCompose);
    } finally {
      setBusy(false);
    }
  }

  const error = message ?? guard.error;

  return (
    <div className="flex flex-col gap-2">
      <input ref={input} type="file" accept={ACCEPT} hidden onChange={(event) => void pick(event)} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="w-full justify-start" disabled={busy} aria-busy={busy}>
            <Plus />
            Novo
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={() => void compose()}>
            <Type />
            <div className="flex flex-1 flex-col gap-0.5 text-left">
              <span className="font-medium">Texto</span>
              <span className="text-xs text-muted-foreground">Escreva ou cole</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => input.current?.click()}>
            <FileText />
            <div className="flex flex-1 flex-col gap-0.5 text-left">
              <span className="font-medium">Documento</span>
              <span className="text-xs text-muted-foreground">PDF, EPUB, DOC, TXT, MD</span>
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
      <LoadingOverlay open={busy} label="Abrindo documento…" />
    </div>
  );
}
