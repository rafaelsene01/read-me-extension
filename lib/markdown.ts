/**
 * Remove Markdown syntax so the text reads naturally when spoken. Works line
 * by line and keeps every line break, so segmentBlock still sees one paragraph
 * per line. Lines inside code fences pass through untouched.
 */
// ponytail: regex in sequence, no parser; move to one if nested Markdown reads wrong.
export function stripMarkdown(md: string): string {
  let inFence = false;
  return md
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return '';
      }
      if (inFence) return line;
      // Horizontal rules (---, ***, * * *) and table separators (|---|:--:|).
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return '';
      if (/^[\s|:-]+$/.test(line) && line.includes('|') && line.includes('-')) return '';

      let text = line
        .replace(/^\s*#{1,6}(\s+|$)/, '')
        .replace(/^\s*(>\s?)+/, '')
        .replace(/^\s*([-*+]|\d+[.)])\s+/, '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/~~(.+?)~~/g, '$1')
        // Emphasis must hug its text and sit outside words: keeps snake_case and 2 * 3.
        .replace(/(?<![\p{L}\p{N}_*])(\*{1,3}|_{1,3})(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}_*])/gu, '$2');

      // ponytail: only rows with an outer pipe count as tables; pipe-less GFM rows stay as is.
      if (/^\s*\||\|\s*$/.test(text)) {
        text = text
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean)
          .join(', ');
      }
      return text;
    })
    .join('\n');
}
