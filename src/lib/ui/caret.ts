/**
 * Where in an element's text a click landed, counted in characters, so a text field that
 * takes its place can put the caret there. Null if the click wasn't on its text.
 */
export function clickOffset(e: MouseEvent, element: HTMLElement): number | null {
  let node: Node | null = null;
  let offset = 0;
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
    if (pos) ({ offsetNode: node, offset } = pos);
  } else if (document.caretRangeFromPoint) {
    // Browsers without caretPositionFromPoint yet
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (range) ({ startContainer: node, startOffset: offset } = range);
  }
  if (!node || !element.contains(node)) return null;

  // The offset is within one text node: add the text before it
  let before = 0;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n === node) return before + offset;
    before += n.textContent!.length;
  }
  return null;
}
