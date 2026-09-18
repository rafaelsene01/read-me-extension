import { useEffect, useRef, useState } from 'react';
import { MESSAGES } from './CaptureBar';
import { languageName } from './Controls';
import { LANGS } from './TranslatePanel';
import { applyEdit, applyLang } from '../lib/edit';
import { sendCommand } from '../lib/messages';
import { removeBlock, setBlocks } from '../lib/storage';
import { isStale } from '../lib/translate';
import type { Block, Cursor, Paragraph, Prefs } from '../lib/types';

interface BlockListProps {
  blocks: Block[];
  cursor: Cursor | null;
  activeTab: Prefs['activeTab'];
  /** Editing is locked while the reading is running. */
  playing: boolean;
}

/** Paragraphs shown for the active tab; null when the block has no translation yet. */
function paragraphsFor(block: Block, activeTab: Prefs['activeTab']): Paragraph[] | null {
  if (activeTab === 'original') return block.paragraphs;
  return block.translation?.paragraphs ?? null;
}

export default function BlockList({ blocks, cursor, activeTab, playing }: BlockListProps) {
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(next: Block[]): Promise<void> {
    const result = await setBlocks(next);
    setError(result.ok ? null : MESSAGES.quota);
  }

  async function persist(block: Block, newText: string): Promise<void> {
    const edited = applyEdit(block, newText);
    if (edited === block) return;
    if (!edited) {
      await removeBlock(block.id);
      return;
    }
    await save(blocks.map((other) => (other.id === block.id ? edited : other)));
  }

  // The page declares the source language and often declares it wrong. The
  // override is per block because a block is one page, and the buffer mixes
  // pages; it lands on block.lang, which is what translation and segmentation
  // already read.
  async function persistLang(block: Block, lang: string): Promise<void> {
    const relanged = applyLang(block, lang);
    if (relanged === block) return;
    await save(blocks.map((other) => (other.id === block.id ? relanged : other)));
  }

  // Position, not sentence id: the translation tab has its own ids at the same
  // cursor coordinates.
  const activeKey = cursor ? `${cursor.blockId}:${cursor.paraIndex}:${cursor.sentIndex}` : null;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center' });
  }, [activeKey, activeTab]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && (
        <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>
          {error}
        </p>
      )}
      {blocks.map((block) => {
        const paragraphs = paragraphsFor(block, activeTab);
        return (
          <article key={block.id} style={{ borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
            <header
              style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}
            >
              <span
                title={block.sourceUrl}
                style={{
                  flex: 1,
                  color: '#6b7280',
                  fontSize: '12px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {block.sourceUrl}
              </span>
              <select
                aria-label="Idioma de origem"
                value={block.lang}
                disabled={playing}
                onChange={(event) => void persistLang(block, event.target.value)}
              >
                {(LANGS.includes(block.lang) ? LANGS : [block.lang, ...LANGS]).map((lang) => (
                  <option key={lang} value={lang}>
                    {languageName(lang)}
                  </option>
                ))}
              </select>
              {activeTab === 'original' && (
                <button
                  type="button"
                  disabled={playing || editingId === block.id}
                  onClick={() => setEditingId(block.id)}
                >
                  Editar
                </button>
              )}
              <button type="button" onClick={() => void removeBlock(block.id)}>
                Remover
              </button>
            </header>

            {activeTab === 'translation' && isStale(block) && (
              <p role="status" style={{ color: '#b45309', margin: '0 0 8px', fontSize: '12px' }}>
                Tradução desatualizada
              </p>
            )}

            {editingId === block.id ? (
              <div
                // Uncontrolled on purpose: a controlled contenteditable destroys
                // the caret and the undo stack on every re-render.
                contentEditable="plaintext-only"
                suppressContentEditableWarning
                ref={(element) => {
                  if (element && document.activeElement !== element) element.focus();
                }}
                onBlur={(event) => {
                  const text = event.currentTarget.innerText;
                  setEditingId(null);
                  void persist(block, text);
                }}
                style={{
                  whiteSpace: 'pre-wrap',
                  border: '1px solid #2563eb',
                  borderRadius: '2px',
                  padding: '4px',
                }}
              >
                {block.text}
              </div>
            ) : paragraphs === null ? (
              <p style={{ color: '#6b7280', margin: 0 }}>Bloco ainda não traduzido.</p>
            ) : (
              paragraphs.map((paragraph, paraIndex) => (
                <p key={paragraph.id} style={{ margin: '0 0 8px' }}>
                  {paragraph.sentences.map((sentence, sentIndex) => {
                    const active =
                      block.id === cursor?.blockId &&
                      paraIndex === cursor.paraIndex &&
                      sentIndex === cursor.sentIndex;
                    return (
                      <span
                        key={sentence.id}
                        ref={active ? activeRef : null}
                        onClick={() =>
                          void sendCommand({
                            type: 'seek',
                            cursor: { blockId: block.id, paraIndex, sentIndex },
                          })
                        }
                        style={{
                          background: active ? '#fef08a' : 'transparent',
                          borderRadius: '2px',
                          cursor: 'pointer',
                        }}
                      >
                        {sentence.text}{' '}
                      </span>
                    );
                  })}
                </p>
              ))
            )}
          </article>
        );
      })}
    </div>
  );
}
