/**
 * Whole-page extraction, after the heuristic Read Aloud uses: find the
 * elements that carry the text by density instead of trusting the markup,
 * pull in the headings that introduce them, then split each one into
 * paragraphs by its block-level boxes.
 *
 * Layout checks go through getComputedStyle. Outside a real browser (linkedom
 * in the tests) it is absent and every element counts as visible.
 */

/** Never descended into while looking for content. */
const SKIPPED_TAGS = [
  'SELECT', 'TEXTAREA', 'BUTTON', 'LABEL', 'AUDIO', 'VIDEO', 'DIALOG', 'EMBED', 'MENU',
  'NAV', 'NOFRAMES', 'NOSCRIPT', 'OBJECT', 'SCRIPT', 'STYLE', 'SVG', 'ASIDE', 'FOOTER',
];
const HEADINGS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
/** Leaves of the content search: text holders plus the skipped tags. */
const LEAF_TAGS = [...HEADINGS, 'P', ...SKIPPED_TAGS];
/** Never read inside a content block. */
const UNREAD_TAGS = [
  'STYLE', 'SCRIPT', 'NOSCRIPT', 'SVG', 'CANVAS', 'IFRAME', 'OBJECT', 'IMG', 'VIDEO',
  'AUDIO', 'SOURCE', 'TRACK', 'MAP', 'AREA', 'SUP',
];
const BLOCK_DISPLAYS = ['block', 'list-item', 'table', 'flex', 'grid', 'flow-root'];
/** Stand-in for computed display when there is no layout engine. */
const BLOCK_TAGS = [
  ...HEADINGS, 'P', 'DIV', 'LI', 'UL', 'OL', 'DL', 'DT', 'DD', 'BLOCKQUOTE', 'PRE',
  'TABLE', 'TR', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FIGURE', 'FIGCAPTION', 'BODY',
];

function styleOf(el: Element): CSSStyleDeclaration | null {
  return el.ownerDocument.defaultView?.getComputedStyle?.(el) ?? null;
}

function textOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function isShown(el: Element): boolean {
  const style = styleOf(el);
  if (!style) return true;
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const box = el as HTMLElement;
  return box.offsetWidth === undefined || (box.offsetWidth > 0 && box.offsetHeight > 0);
}

/** Visible all the way up: the checks a text node inherits from its ancestors. */
function isRendered(el: Element | null): boolean {
  for (; el && el.tagName !== 'BODY'; el = el.parentElement) {
    const style = styleOf(el);
    if (el.hasAttribute('hidden')) return false;
    if (!style) continue;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
  }
  return true;
}

/** Media, footnote marks and floating or fixed boxes (sidebars, banners). */
function isUnread(el: Element): boolean {
  if (UNREAD_TAGS.includes(el.tagName)) return true;
  const style = styleOf(el);
  return style?.float === 'right' || style?.position === 'fixed';
}

/**
 * Elements holding the content, in document order and never nested. An
 * element qualifies when it has its own text (a text node of 3+ chars and
 * minLength chars overall) or a visible paragraph child of minLength chars.
 */
function findBlocks(root: Element, minLength: number): Element[] {
  const hasOwnText = (el: Element): boolean =>
    Array.from(el.childNodes).some(
      (node) => node.nodeType === 3 && (node.nodeValue ?? '').trim().length >= 3,
    ) && textOf(el).length >= minLength;
  const hasParagraph = (el: Element): boolean =>
    Array.from(el.children).some(
      (child) => child.tagName === 'P' && isShown(child) && textOf(child).length >= minLength,
    );
  const descend = (el: Element): Element[] =>
    Array.from(el.children).filter((child) => !LEAF_TAGS.includes(child.tagName));
  const hasTextBelow = (el: Element): boolean =>
    descend(el).some((child) => hasOwnText(child) || hasParagraph(child) || hasTextBelow(child));

  const found: Element[] = [];
  const walk = (el: Element): void => {
    const tag = el.tagName;
    const children = Array.from(el.children);
    if (tag === 'IFRAME' || tag === 'FRAME') {
      try {
        const body = (el as HTMLIFrameElement).contentDocument?.body;
        if (body) walk(body);
      } catch {
        // Cross-origin frame: its document is off limits.
      }
    } else if (tag === 'DL') {
      found.push(el);
    } else if (tag === 'UL' || tag === 'OL') {
      if (children.some((li) => hasOwnText(li) || hasParagraph(li) || hasTextBelow(li))) {
        found.push(el);
      }
    } else if (tag === 'TBODY') {
      // A wide or long table is data, read as one block; a small one is layout.
      const wide = children.length > 3 || (children[0]?.children.length ?? 0) > 3;
      if (!wide) children.forEach(walk);
      else if (children.some(hasTextBelow)) found.push(el);
    } else if (hasOwnText(el) || hasParagraph(el)) {
      found.push(el);
    } else {
      descend(el).forEach(walk);
      if (el.shadowRoot) Array.from(el.shadowRoot.children).forEach(walk);
    }
  };
  walk(root);

  return found.filter((el) => {
    if (!isShown(el)) return false;
    // Parked off-screen to the left: skip links and the like.
    return styleOf(el) === null || el.getBoundingClientRect().left >= 0;
  });
}

function stats(values: number[]): { mean: number; stdev: number } {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, stdev: Math.sqrt(variance) };
}

/**
 * Content blocks of the page. A short page is searched again with a 3 char
 * floor, and the page chrome that floor lets in is trimmed: leading and
 * trailing runs that end at a block far longer than the ones around it.
 */
function contentBlocks(root: Element): Element[] {
  let blocks = findBlocks(root, 50);
  if (blocks.reduce((sum, el) => sum + textOf(el).length, 0) >= 1000) return blocks;

  blocks = findBlocks(root, 3);
  const lengths = blocks.map((el) => textOf(el).length);
  let start: number | undefined;
  for (let i = 3; i < lengths.length && start === undefined; i++) {
    const { mean, stdev } = stats(lengths.slice(0, i));
    if (lengths[i]! > mean + 2 * stdev) start = i;
  }
  let end: number | undefined;
  for (let i = lengths.length - 4; i >= 0 && end === undefined; i--) {
    const { mean, stdev } = stats(lengths.slice(i + 1));
    if (lengths[i]! > mean + 2 * stdev) end = i + 1;
  }
  return blocks.slice(start ?? 0, end);
}

function headingLevel(el: Element | null | undefined): number {
  const match = el?.tagName.match(/^H(\d)$/);
  return match ? Number(match[1]) : 100;
}

/** Previous node in reverse document order; `skipInside` stays out of node's subtree. */
function previousNode(node: Node, skipInside: boolean): Node | null {
  if (node.nodeType === 1 && !skipInside && node.lastChild) return node.lastChild;
  if (node.previousSibling) return node.previousSibling;
  return node.parentNode ? previousNode(node.parentNode, true) : null;
}

/**
 * Headings between the previous block and this one that introduce it: walking
 * back, each kept heading outranks the one after it (h3, then h2, then h1).
 */
function introHeadings(root: Element, block: Element, previous: Element | undefined): Element[] {
  const first = Array.from(block.querySelectorAll('h1,h2,h3,h4,h5,h6,p')).find(isShown);
  let level = headingLevel(first);
  const headings: Element[] = [];
  for (
    let node = previousNode(block, true);
    node && node !== previous && root.contains(node);
    node = previousNode(node, SKIPPED_TAGS.includes((node as Element).tagName))
  ) {
    if (node.nodeType !== 1 || previous?.contains(node)) continue;
    const el = node as Element;
    if (SKIPPED_TAGS.includes(el.tagName) || !isShown(el)) continue;
    const nodeLevel = headingLevel(el);
    if (nodeLevel < level) {
      headings.push(el);
      level = nodeLevel;
    }
  }
  return headings.reverse();
}

function isBlockBox(el: Element): boolean {
  const display = styleOf(el)?.display;
  return display === undefined ? BLOCK_TAGS.includes(el.tagName) : BLOCK_DISPLAYS.includes(display);
}

/** One line per block-level box inside el, from its visible, readable text. */
function paragraphsOf(el: Element): string[] {
  const groups = new Map<Element, string[]>();
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      const text = node.nodeValue ?? '';
      const parent = node.parentElement;
      if (!parent || !text.trim() || !isRendered(parent)) return;
      let box: Element = parent;
      while (box !== el && box.parentElement && !isBlockBox(box)) box = box.parentElement;
      groups.set(box, [...(groups.get(box) ?? []), text]);
      return;
    }
    if (node.nodeType !== 1 || isUnread(node as Element)) return;
    node.childNodes.forEach(visit);
  };
  visit(el);
  return [...groups.values()]
    .map((texts) => texts.join('').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * The page as one line per paragraph, in reading order. The search runs inside
 * main when the page marks one (then role=main, then article), else the body.
 */
export function extractFromPage(doc: Document): string {
  const root =
    doc.querySelector('main') ??
    doc.querySelector('[role="main"]') ??
    doc.querySelector('article') ??
    doc.body;
  const blocks = contentBlocks(root);
  const lines: string[] = [];
  blocks.forEach((block, index) => {
    for (const el of [...introHeadings(root, block, blocks[index - 1]), block]) {
      if (!isUnread(el)) lines.push(...paragraphsOf(el));
    }
  });
  return lines.join('\n');
}
