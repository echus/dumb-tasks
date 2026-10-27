<script lang="ts">
  import Icon from './Icon.svelte';
  import { effectiveTheme, toggleTheme } from '../lib/theme.svelte';
  import * as ui from '../lib/ui-icons';

  // Shows the current theme; clicking switches to the other.
  const dark = $derived(effectiveTheme() === 'dark');
</script>

<button
  aria-pressed={dark}
  aria-label="Dark mode"
  title={dark ? 'Dark mode (click for light)' : 'Light mode (click for dark)'}
  onclick={toggleTheme}
>
  <Icon svg={dark ? ui.moon : ui.sun} size={18} />
</button>

<style>
  button {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    color: var(--icon-quiet);
    cursor: pointer;
  }

  button:hover {
    color: var(--accent);
  }
</style>
