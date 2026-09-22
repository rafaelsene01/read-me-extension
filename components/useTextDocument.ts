import { useEffect, useState } from 'react';
import { UNTITLED } from '../lib/document';
import { t } from '../lib/i18n';
import { segmentBlock } from '../lib/segment';
import { setBlocks } from '../lib/storage';
import type { Block } from '../lib/types';

/** Typing pause after which the buffer is written; a write per keystroke is wasteful. */
const SAVE_AFTER = 600;

/**
 * The state of a document being typed or pasted in. The fields live here rather
 * than in one component because the title sits in the document header and the
 * text in the body; both end up in the same block the rest of the app reads, so
 * playing, saving and exporting need to know nothing about it.
 *
 * `block` is undefined whenever nothing is being composed.
 */
export function useTextDocument(
  block: Block | undefined,
  onError: (message: string | null) => void,
): {
  title: string;
  setTitle: (title: string) => void;
  text: string;
  setText: (text: string) => void;
} {
  // Held locally, not read back from the store: the block is rewritten as the
  // user types, and following it would fight the caret.
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    // An untitled document shows the (translated) placeholder, not the stored name.
    setTitle(block?.sourceTitle === UNTITLED ? '' : (block?.sourceTitle ?? ''));
    setText(block?.text ?? '');
  }, [block?.id]);

  useEffect(() => {
    if (!block) return;
    const name = title.trim() || UNTITLED;
    if (name === block.sourceTitle && text === block.text) return;

    const timer = setTimeout(() => {
      void setBlocks([
        {
          ...block,
          sourceUrl: name,
          sourceTitle: name,
          text,
          paragraphs: segmentBlock(text, block.lang, block.id),
        },
      ]).then((result) => onError(result.ok ? null : t('Armazenamento cheio')));
    }, SAVE_AFTER);

    return () => clearTimeout(timer);
    // The language changes through the header; the next edit picks it up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, text, block?.id, block?.lang]);

  return { title, setTitle, text, setText };
}
