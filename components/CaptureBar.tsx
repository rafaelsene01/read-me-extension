import { useEffect, useState } from 'react';
import { BookOpenText, CircleAlert, ExternalLink, MousePointerClick, Settings } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { requestAndCapture, type CaptureFailure } from '../lib/capture';
import { type CaptureMode } from '../lib/messages';
import { t, type Key } from '../lib/i18n';

/** Keys, translated with t() where they are shown. */
export const MESSAGES: Record<CaptureFailure, Key | null> = {
  unsupported: 'Não é possível capturar desta página',
  denied: 'Sem acesso a este site',
  inaccessible: 'Conteúdo inacessível nesta região da página',
  // Escape closed the picker on purpose; nothing to report.
  cancelled: null,
  empty: 'Nada para capturar',
  full: 'Buffer cheio — limpe ou remova blocos',
  quota: 'Armazenamento cheio',
};

function openSite(hash: string): void {
  void chrome.tabs
    .create({ url: chrome.runtime.getURL(`/documents.html${hash}`) })
    // The panel is disabled on that page anyway: closing it here
    // saves the user a second click to tidy up.
    .then(() => window.close())
    .catch(() => {});
}

export default function CaptureBar() {
  const [tab, setTab] = useState<{ id: number; url: string | null } | null>(null);
  const [message, setMessage] = useState<Key | null>(null);

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

  return (
    <section className="flex flex-col gap-2">
      {/* The way to the extension site and its settings stays in sight: the
          panel is only the quick reader, and the user has to see there is more. */}
      <header className="flex min-w-0 items-center gap-1">
        <h1 className="flex-1 font-serif text-base font-semibold">ReadMe</h1>
        <Button variant="ghost" size="sm" className="min-w-0" onClick={() => openSite('')}>
          <ExternalLink />
          <span className="truncate">{t('Abrir o site da extensão')}</span>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('Configurações')}
              onClick={() => openSite('#settings')}
            >
              <Settings />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('Configurações')}</TooltipContent>
        </Tooltip>
      </header>

      <div className="flex min-w-0 gap-2">
        <Button className="min-w-0 flex-1" onClick={() => capture('page')}>
          <BookOpenText />
          <span className="truncate">{t('Ler página')}</span>
        </Button>
        <Button variant="outline" className="min-w-0 flex-1" onClick={() => capture('picker')}>
          <MousePointerClick />
          <span className="truncate">{t('Escolher elemento')}</span>
        </Button>
      </div>

      {message && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{t(message)}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
