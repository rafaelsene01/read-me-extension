import { useEffect, useState } from 'react';
import { BookOpenText, CircleAlert, FileText, MousePointerClick, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { requestAndCapture, type CaptureFailure } from '../lib/capture';
import { sendCommand, type CaptureMode } from '../lib/messages';
import { clearBlocks } from '../lib/storage';

export const MESSAGES: Record<CaptureFailure, string | null> = {
  unsupported: 'Não é possível capturar desta página',
  denied: 'Sem acesso a este site',
  inaccessible: 'Conteúdo inacessível nesta região da página',
  // Escape closed the picker on purpose; nothing to report.
  cancelled: null,
  empty: 'Nada para capturar',
  full: 'Buffer cheio — limpe ou remova blocos',
  quota: 'Armazenamento cheio',
};

interface CaptureBarProps {
  empty: boolean;
}

export default function CaptureBar({ empty }: CaptureBarProps) {
  const [tab, setTab] = useState<{ id: number; url: string | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // The active tab is kept in state so the capture handler can call
    // permissions.request without awaiting anything first, which is what keeps
    // the click counting as user activation.
    const load = (): void => {
      void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([active]) => {
        // url is hidden until the extension has access to that tab; the id is not.
        setTab(active?.id === undefined ? null : { id: active.id, url: active.url ?? null });
      });
    };
    load();
    chrome.tabs.onActivated.addListener(load);
    chrome.tabs.onUpdated.addListener(load);
    return () => {
      chrome.tabs.onActivated.removeListener(load);
      chrome.tabs.onUpdated.removeListener(load);
    };
  }, []);

  async function run(tabId: number, url: string, mode: CaptureMode): Promise<void> {
    const result = await requestAndCapture(tabId, url, mode);
    if (!result.ok) setMessage(MESSAGES[result.reason]);
  }

  function capture(mode: CaptureMode): void {
    setMessage(null);
    if (!tab) {
      setMessage(MESSAGES.unsupported);
      return;
    }
    if (tab.url) {
      void run(tab.id, tab.url, mode);
      return;
    }

    // SPEC_DEVIATION: spec P1-A AC7 asks for permissions.request with the host
    // of the active tab.
    // Reason: without the "tabs" permission chrome.tabs hides the url until the
    // extension already has access to that tab, so there is no host to name.
    // <all_urls>, declared in optional_host_permissions, is requested instead,
    // still inside the click task; the url is read back once it is granted.
    void chrome.permissions.request({ origins: ['<all_urls>'] }).then(async (granted) => {
      if (!granted) {
        setMessage(MESSAGES.denied);
        return;
      }
      const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (active?.id === undefined || !active.url) {
        setMessage(MESSAGES.unsupported);
        return;
      }
      await run(active.id, active.url, mode);
    });
  }

  async function clear(): Promise<void> {
    setMessage(null);
    await sendCommand({ type: 'stop' });
    await clearBlocks();
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => capture('page')}>
          <BookOpenText />
          Ler página
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => capture('picker')}>
          <MousePointerClick />
          Escolher elemento
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Documentos"
              onClick={() =>
                void chrome.tabs
                  .create({ url: chrome.runtime.getURL('/documents.html') })
                  .catch(() => {})
              }
            >
              <FileText />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Documentos</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Limpar"
              disabled={empty}
              onClick={() => void clear()}
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Limpar</TooltipContent>
        </Tooltip>
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
