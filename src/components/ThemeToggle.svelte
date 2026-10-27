<script lang="ts">
  import Icon from './Icon.svelte';
  import { effectiveTheme, toggleTheme } from '../lib/theme.svelte';
  import * as ui from '../lib/ui-icons';

  // Shows the theme a click switches to: a sun in dark mode, a moon in light mode.
  const dark = $derived(effectiveTheme() === 'dark');
  const label = $derived(dark ? 'Switch to light mode' : 'Switch to dark mode');
</script>

<button aria-label={label} title={label} onclick={toggleTheme}>
  <Icon svg={dark ? ui.sun : ui.moon} size={18} />
</button>

<style>
  button {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    color: var(--ink-faded);
    cursor: pointer;
  }

  button:hover {
    color: var(--accent);
  }
</style>
