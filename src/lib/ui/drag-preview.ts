// The copy of a dragged task's row that follows the pointer (see drag-and-drop.ts): the row
// (icon, text, badge) on a card, with a label above it saying where it's headed when it's
// over a tab. Styled in app.css (.drag-preview).

export class DragPreview {
  private wrap: HTMLElement;
  private label: HTMLElement;

  /** Lifts a copy of the row off its list, with the pointer `grabX`, `grabY` into the row. */
  constructor(
    row: HTMLElement,
    private grabX: number,
    private grabY: number,
    x: number,
    y: number,
  ) {
    const box = row.getBoundingClientRect();
    const copy = row.cloneNode(true) as HTMLElement;
    copy.style.listStyle = 'none';
    const card = document.createElement('div');
    card.className = 'drag-card';
    card.append(copy);
    this.label = document.createElement('div');
    this.label.className = 'drag-label';
    this.wrap = document.createElement('div');
    this.wrap.className = 'drag-preview';
    this.wrap.style.width = `${box.width}px`;
    this.wrap.append(this.label, card);

    // The copy shrinks towards the pointer, and its label sits just above it (kept on screen)
    this.wrap.style.setProperty('--grab-x', `${grabX}px`);
    this.wrap.style.setProperty('--grab-y', `${grabY}px`);
    this.wrap.style.setProperty('--label-x', `${Math.min(Math.max(grabX, 70), box.width - 70)}px`);
    document.body.append(this.wrap);
    this.follow(x, y);
    void this.wrap.offsetWidth; // start from flat, so it grows into the lift
    this.wrap.classList.add('lifted');
  }

  follow(x: number, y: number) {
    this.wrap.style.transform = `translate(${x - this.grabX}px, ${y - this.grabY}px)`;
  }

  /** Over a tab, the copy fades back so the tab shows, and says where it's going. */
  overTab(label: string | null) {
    this.wrap.classList.toggle('over-tab', label !== null);
    if (label !== null) this.label.textContent = label;
  }

  /** Glides into a gap in a list, whose top left is at (x, y). */
  settleAt(x: number, y: number) {
    this.wrap.classList.add('settling');
    this.wrap.classList.remove('lifted', 'over-tab');
    this.wrap.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Glides into a tab, shrinking away. */
  settleInto(tab: HTMLElement) {
    const box = tab.getBoundingClientRect();
    this.wrap.classList.add('settling');
    this.wrap.classList.remove('lifted');
    const x = box.left + box.width / 2 - this.wrap.offsetWidth / 2;
    const y = box.top + box.height / 2 - this.wrap.offsetHeight / 2;
    this.wrap.style.transform = `translate(${x}px, ${y}px)`;
    this.wrap.classList.add('gone');
  }

  remove() {
    this.wrap.remove();
  }
}
