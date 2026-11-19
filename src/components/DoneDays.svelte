<script lang="ts">
  import DoneRow from './DoneRow.svelte';
  import Icon from './Icon.svelte';
  import { KEEP_DAYS } from '$lib/sync/data-file';
  import {
    addDays,
    addMonths,
    dateLabel,
    doneByDay,
    monthCells,
    monthLabel,
    monthName,
    relativeDay,
    shortDayLabel,
    weekdayLabels,
  } from '$lib/tasks/done-days';
  import { tick } from 'svelte';
  import { dayOf } from '$lib/tasks/tasks';
  import * as ui from '$lib/ui/icons';
  import { closeDoneView, doneView, showDone } from '$lib/ui/done-view.svelte';
  import { clock } from '$lib/ui/state.svelte';
  import type { Task } from '$lib/types';

  let { tasks }: { tasks: Task[] } = $props();

  // From every list: once a day is over, which list a task was in no longer matters
  const byDay = $derived(doneByDay(tasks));
  const today = $derived(dayOf(clock.now));
  const firstKept = $derived(addDays(today, 1 - KEEP_DAYS)); // older done tasks are removed
  const weekdays = weekdayLabels();

  // What shows comes from the address (see done-view): today, a picked day, or a whole month.
  // The month's name, or stepping to another month, lists the whole month.
  const target = $derived(doneView.target);
  const month = $derived((target ?? today).slice(0, 7));
  const picked = $derived(target === null ? today : target.length === 10 ? target : null);

  const kept = (day: string) => day >= firstKept && day <= today;
  const count = (day: string) => byDay.get(day)?.length ?? 0;
  const pick = (day: string) => showDone(day === today ? null : day);

  // The calendar is one Tab stop, on the picked day (or today, or the month's last kept day);
  // the arrow keys move from there, as in a date picker
  const focusDay = $derived.by(() => {
    if (picked?.startsWith(month)) return picked;
    const days = monthCells(month).filter((d): d is string => d !== null && kept(d));
    return days.includes(today) ? today : days.at(-1);
  });

  const MOVES: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

  async function moveByKey(e: KeyboardEvent) {
    const from = (e.target as HTMLElement).dataset.day;
    if (!from || !(e.key in MOVES)) return;
    e.preventDefault();
    const to = addDays(from, MOVES[e.key]);
    if (!kept(to)) return;
    pick(to);
    await tick();
    document.querySelector<HTMLElement>(`[data-day="${to}"]`)?.focus();
  }

  const shown = $derived(
    picked
      ? (byDay.get(picked) ?? []).map((task) => ({ task, when: undefined }))
      : [...byDay]
          .filter(([day]) => day.startsWith(month))
          .sort(([a], [b]) => b.localeCompare(a))
          .flatMap(([day, done]) => done.map((task) => ({ task, when: shortDayLabel(day) }))),
  );

  // "3 tasks done today", "1 task done on Tue 17 Nov", "51 tasks done in November"
  const when = $derived.by(() => {
    if (!picked) return { link: 'in', what: monthName(month) };
    const relative = relativeDay(picked, clock.now);
    return relative ? { link: '', what: relative } : { link: 'on', what: dateLabel(picked, clock.now) };
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !(e.target as HTMLElement).closest('input, [popover]')) closeDoneView();
  }
</script>

<svelte:window {onkeydown} />

<section aria-labelledby="done-days-title">
  <div class="inner">
    <div class="top">
      <button class="back" aria-label="Back to tasks" title="Back to tasks" onclick={closeDoneView}>
        <Icon svg={ui.arrowLeft} size={18} />
      </button>
      <h2 id="done-days-title">done history</h2>
    </div>

    <div class="calendar">
      <div class="nav">
        <button
          class="arrow"
          aria-label="Previous month"
          disabled={month <= firstKept.slice(0, 7)}
          onclick={() => showDone(addMonths(month, -1))}
        >
          <Icon svg={ui.caretLeft} size={16} />
        </button>
        <!-- The month's name lists every task done that month -->
        <button
          class="month"
          aria-pressed={picked === null}
          aria-label="Show every task done in {monthLabel(month)}"
          onclick={() => showDone(month)}>{monthLabel(month)}</button
        >
        <button class="arrow" aria-label="Next month" disabled={month >= today.slice(0, 7)} onclick={() => showDone(addMonths(month, 1))}>
          <Icon svg={ui.caretRight} size={16} />
        </button>
      </div>

      <!-- svelte-ignore a11y_no_static_element_interactions: the keys are handled on the day buttons, bubbling up -->
      <div class="grid" onkeydown={moveByKey}>
        {#each weekdays as weekday (weekday)}
          <span class="weekday" aria-hidden="true">{weekday}</span>
        {/each}
        {#each monthCells(month) as day, i (day ?? `blank-${i}`)}
          {#if day === null}
            <span></span>
          {:else if kept(day)}
            {@const n = count(day)}
            <!-- Greener for more done, up to 5: a good day's worth -->
            <button
              class="day level-{Math.min(n, 5)}"
              class:today={day === today}
              class:picked={day === picked}
              aria-pressed={day === picked}
              tabindex={day === focusDay ? 0 : -1}
              data-day={day}
              aria-label="{n} done on {dateLabel(day, clock.now)}{day === today ? ', today' : ''}"
              onclick={() => pick(day)}
            >
              <span class="date">{Number(day.slice(8))}</span>
              <!-- Always there, so dates line up across a row whether or not a day has a count -->
              <span class="count">{n || ''}</span>
            </button>
          {:else}
            <!-- Not kept yet, or no longer: nothing to show -->
            <span class="day blank"><span class="date">{Number(day.slice(8))}</span><span class="count"></span></span>
          {/if}
        {/each}
      </div>
    </div>

    <!-- The eye goes to the number and the day; the words between are quieter -->
    <h3 id="done-shown">
      <span class="total" class:none={shown.length === 0}>{shown.length}</span>
      <span class="quiet">{shown.length === 1 ? 'task' : 'tasks'} done {when.link}</span>
      {when.what}
    </h3>
    {#if shown.length}
      <div class="list">
        <ul aria-labelledby="done-shown">
          {#each shown as { task, when } (task.id)}
            <DoneRow {task} {when} />
          {/each}
        </ul>
      </div>
    {/if}

    <p class="note">Done tasks are kept for {KEEP_DAYS} days.</p>
  </div>
</section>

<style>
  section {
    flex: 1;
    padding: 8px 0 64px;
  }

  /* One column in the middle */
  .inner {
    max-width: 480px;
    margin: 0 auto;
  }

  /* Desktop: the page fills the window, so the view scrolls within it */
  @media (min-width: 1100px) {
    section {
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: thin;
      padding-bottom: 16px;
    }
  }

  .top {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 0 8px -8px; /* the arrow's own space, so it lines up with the page edge */
  }

  .back,
  .arrow {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    color: var(--ink-faded);
    cursor: pointer;
  }

  .back:hover,
  .arrow:hover {
    color: var(--accent);
  }

  .arrow:disabled {
    visibility: hidden;
  }

  h2,
  h3 {
    margin: 0;
    font-family: var(--font-title);
    font-variation-settings: var(--title-opsz);
    font-weight: 700;
    text-transform: lowercase;
  }

  h2 {
    font-size: 1.1rem;
  }

  /* On the list's own white, like a task list */
  .calendar,
  .list {
    position: relative;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow:
      0 0 10px var(--glow),
      inset 0 0 0 1px var(--glow-ring);
  }

  .calendar {
    padding: 4px 12px 12px;
  }

  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .month {
    padding: 4px 8px;
    border: none;
    background: none;
    font-weight: 600;
    cursor: pointer;
  }

  .month:hover,
  .month[aria-pressed='true'] {
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 5px;
  }

  .weekday {
    padding-bottom: 2px;
    color: var(--muted);
    font-size: 0.7rem;
    text-align: center;
  }

  .day {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: var(--cal-0);
    color: var(--cal-ink);
    font-size: 13px;
    line-height: 1.2;
    cursor: pointer;
  }

  .level-1 {
    background: var(--cal-1);
  }

  .level-2 {
    background: var(--cal-2);
  }

  .level-3 {
    background: var(--cal-3);
  }

  .level-4 {
    background: var(--cal-4);
    color: var(--cal-ink-bright);
  }

  .level-5 {
    background: var(--cal-5);
    color: var(--cal-ink-5);
  }

  .count {
    min-height: 1em;
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
  }

  /* Today: bigger and bold, with no mark that leans on colour */
  .today .date {
    font-size: 17px;
    font-weight: 700;
    line-height: 19px;
  }

  .today .count {
    font-size: 13px;
    font-weight: 700;
  }

  /* The picked day, and a day pointed at, get the same light grey outline. Hover only with a
     real mouse - phones keep the last-tapped spot "hovered" */
  .picked {
    outline: 1px solid var(--border-strong);
  }

  @media (hover: hover) {
    .day:not(.blank):hover {
      outline: 1px solid var(--border-strong);
    }
  }

  /* Before what's kept, or still to come */
  .blank {
    background: none;
    color: var(--muted);
    cursor: default;
  }

  /* Over the list: how many, and when */
  h3 {
    padding: 18px 2px 8px;
    font-size: 0.95rem;
  }

  /* The number in the calendar's deepest green */
  .total {
    color: var(--cal-5);
  }

  /* Nothing to celebrate */
  .total.none {
    color: var(--text);
  }

  .quiet {
    color: var(--muted);
    font-weight: 600;
  }

  .list {
    overflow: clip;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .note {
    margin: 16px 2px 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
