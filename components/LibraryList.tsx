import { useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  ChevronRight,
  CircleAlert,
  FileText,
  Folder,
  FolderPlus,
  LayoutGrid,
  Library,
  List,
  MoreVertical,
  Search,
  Trash2,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import LoadingOverlay, { LoadingMark } from './LoadingOverlay';
import { useReplaceGuard } from './useReplaceGuard';
import { deleteBook } from '../lib/book-assets';
import { documentKind, type LibraryDocument } from '../lib/document';
import {
  createFolder,
  deleteDocument,
  deleteFolder,
  getDocuments,
  getFolders,
  moveDocument,
} from '../lib/storage';

interface LibraryListProps {
  /** Runs after the chosen document replaced the buffer (e.g. select the Arquivo tab). */
  onOpened: () => void;
}

/** The value the format filter uses for "any format". */
const ANY = 'todos';

export default function LibraryList({ onOpened }: LibraryListProps) {
  const [docs, setDocs] = useState<LibraryDocument[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState(ANY);
  /** null while at the top level. */
  const [folder, setFolder] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /** The name being typed; null while the dialog is closed. */
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LibraryDocument | null>(null);
  const [pendingFolderDelete, setPendingFolderDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The library is read from storage: until it answers, it is not "empty". */
  const [loading, setLoading] = useState(true);
  const guard = useReplaceGuard();

  useEffect(() => {
    const load = (): void => {
      void Promise.all([getDocuments().then(setDocs), getFolders().then(setFolders)]).finally(() =>
        setLoading(false),
      );
    };
    load();
    // Saves happen from other views too, so follow the store.
    chrome.storage.local.onChanged.addListener(load);
    return () => chrome.storage.local.onChanged.removeListener(load);
  }, []);

  // A folder deleted elsewhere must not leave the view inside nothing.
  useEffect(() => {
    if (folder !== null && !folders.includes(folder)) setFolder(null);
  }, [folders, folder]);

  const kinds = useMemo(
    () => [...new Set(docs.map(documentKind))].sort((a, b) => a.localeCompare(b)),
    [docs],
  );

  const shown = docs.filter(
    (doc) =>
      (doc.folder ?? null) === folder &&
      (kind === ANY || documentKind(doc) === kind) &&
      doc.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const filtering = search.trim() !== '' || kind !== ANY;

  async function run(action: Promise<{ ok: boolean }>, message: string): Promise<void> {
    setError((await action).ok ? null : message);
  }

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
    // A no-op when the document has no file stored.
    await deleteBook(doc.id);
  }

  function documentMenu(doc: LibraryDocument) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${doc.name}`}>
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        {/* Also the way to file a document without dragging, which WCAG 2.2 requires. */}
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Mover para</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={doc.folder === undefined}
            onSelect={() => void run(moveDocument(doc.id, null), 'Falha ao mover')}
          >
            <Library />
            Biblioteca
          </DropdownMenuItem>
          {folders.map((name) => (
            <DropdownMenuItem
              key={name}
              disabled={doc.folder === name}
              onSelect={() => void run(moveDocument(doc.id, name), 'Falha ao mover')}
            >
              <Folder />
              <span className="truncate">{name}</span>
            </DropdownMenuItem>
          ))}
          {folders.length === 0 && <DropdownMenuItem disabled>Nenhuma pasta criada</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setPendingDelete(doc)}>
            <Trash2 />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function cover(doc: LibraryDocument, className: string) {
    return doc.cover ? (
      <img src={doc.cover} alt="" className={cn('shrink-0 object-cover', className)} />
    ) : (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center bg-muted text-muted-foreground',
          className,
        )}
      >
        <FileText className="size-6" />
      </span>
    );
  }

  /** What makes a card a drag source, in both views. */
  function dragProps(doc: LibraryDocument) {
    return {
      draggable: true,
      onDragStart: (event: DragEvent) => {
        event.dataTransfer.setData('text/plain', doc.id);
        event.dataTransfer.effectAllowed = 'move';
      },
    };
  }

  /** Drop zone of a folder, and of the breadcrumb that takes a document back out. */
  function dropProps(name: string | null) {
    const id = name ?? '';
    return {
      onDragOver: (event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropTarget(id);
      },
      onDragLeave: () => setDropTarget((current) => (current === id ? null : current)),
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        setDropTarget(null);
        const docId = event.dataTransfer.getData('text/plain');
        if (docId) void run(moveDocument(docId, name), 'Falha ao mover');
      },
      'data-over': dropTarget === id ? '' : undefined,
    };
  }

  /** Highlight of a drop zone the pointer is over. */
  const over = 'data-[over]:border-primary data-[over]:bg-accent';

  return (
    <div className="flex flex-col gap-4">
      {(guard.error ?? error) && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{guard.error ?? error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome"
            aria-label="Buscar na biblioteca"
            className="pl-9"
          />
        </div>

        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger aria-label="Filtrar por formato" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos os formatos</SelectItem>
            {kinds.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Nova pasta"
              onClick={() => setNewFolder('')}
            >
              <FolderPlus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Nova pasta</TooltipContent>
        </Tooltip>

        <ToggleGroup
          type="single"
          variant="outline"
          value={view}
          onValueChange={(next) => next && setView(next as 'list' | 'grid')}
        >
          <ToggleGroupItem value="list" aria-label="Ver em lista">
            <List />
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" aria-label="Ver em cartões">
            <LayoutGrid />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {folder !== null && (
        <nav aria-label="Local" className="flex items-center gap-1 text-sm">
          <Button
            variant="ghost"
            size="sm"
            className={cn('border border-transparent', over)}
            onClick={() => setFolder(null)}
            {...dropProps(null)}
          >
            <Library />
            Biblioteca
          </Button>
          <ChevronRight className="size-4 text-muted-foreground" />
          <span className="font-medium">{folder}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Excluir pasta ${folder}`}
            className="ml-auto"
            onClick={() => setPendingFolderDelete(folder)}
          >
            <Trash2 />
          </Button>
        </nav>
      )}

      {folder === null && folders.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
          {folders.map((name) => (
            <li key={name}>
              <Button
                variant="outline"
                className={cn('h-auto w-full justify-start gap-2 px-3 py-2', over)}
                onClick={() => setFolder(name)}
                {...dropProps(name)}
              >
                <Folder className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-left">{name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {docs.filter((doc) => doc.folder === name).length}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <LoadingOverlay open={guard.opening} label="Abrindo documento…" />

      {loading ? (
        <div
          role="status"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-muted-foreground"
        >
          <LoadingMark />
          Carregando biblioteca…
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
            <Library className="size-5" />
          </span>
          <p className="font-serif text-base">
            {filtering
              ? 'Nenhum documento corresponde ao filtro.'
              : folder !== null
                ? 'Pasta vazia. Arraste documentos para cá.'
                : 'Nenhum documento salvo.'}
          </p>
          {filtering && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setKind(ANY);
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      ) : view === 'grid' ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          {shown.map((doc) => (
            <li key={doc.id}>
              <Card className="relative gap-0 overflow-hidden p-0" {...dragProps(doc)}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer flex-col text-left transition-colors hover:bg-accent"
                  onClick={() => void guard.open(doc.blocks, onOpened)}
                >
                  {cover(doc, 'h-40 w-full')}
                  <span className="flex flex-col gap-1 p-3">
                    <span className="truncate font-serif text-sm font-medium">{doc.name}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-normal">
                        {documentKind(doc)}
                      </Badge>
                      <span className="truncate text-xs text-muted-foreground">
                        {new Date(doc.savedAt).toLocaleDateString()}
                      </span>
                    </span>
                  </span>
                </button>
                <span className="absolute right-1 top-1 rounded-md bg-background/80 backdrop-blur">
                  {documentMenu(doc)}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="gap-0 py-1">
          <ul>
            {shown.map((doc) => (
              <li key={doc.id} className="flex items-center pr-2" {...dragProps(doc)}>
                <Button
                  variant="ghost"
                  className="h-auto min-w-0 flex-1 flex-row items-center gap-3 rounded-none px-4 py-2 text-left"
                  onClick={() => void guard.open(doc.blocks, onOpened)}
                >
                  {cover(doc, 'h-16 w-12 rounded-sm')}
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span className="w-full truncate font-serif font-medium">{doc.name}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-normal">
                        {documentKind(doc)}
                      </Badge>
                      <span className="text-xs font-normal text-muted-foreground">
                        {new Date(doc.savedAt).toLocaleString()}
                      </span>
                    </span>
                  </span>
                </Button>
                {documentMenu(doc)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {guard.dialog}

      <Dialog open={newFolder !== null} onOpenChange={(open) => !open && setNewFolder(null)}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const name = newFolder ?? '';
              setNewFolder(null);
              void run(createFolder(name), 'Falha ao criar a pasta');
            }}
          >
            <DialogHeader>
              <DialogTitle>Nova pasta</DialogTitle>
              <DialogDescription>
                Arraste documentos para a pasta, ou use o menu de cada um.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              value={newFolder ?? ''}
              onChange={(event) => setNewFolder(event.target.value)}
              placeholder="Nome da pasta"
              aria-label="Nome da pasta"
              className="my-4"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewFolder(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!newFolder?.trim()}>
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

      <Dialog
        open={pendingFolderDelete !== null}
        onOpenChange={(isOpen) => !isOpen && setPendingFolderDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir pasta?</DialogTitle>
            <DialogDescription>
              "{pendingFolderDelete}" será removida. Os documentos dentro dela voltam para a
              biblioteca.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingFolderDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const name = pendingFolderDelete;
                setPendingFolderDelete(null);
                if (name) void run(deleteFolder(name), 'Falha ao excluir a pasta');
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
