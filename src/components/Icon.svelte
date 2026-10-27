<script lang="ts">
  // Renders one of the bundled Phosphor SVGs (filled, coloured by currentColor).
  let { svg, size = 16 }: { svg: string; size?: number } = $props();
</script>

<span class="glyph" style:--size="{size}px" aria-hidden="true">{@html svg}</span>

<style>
  .glyph {
    display: inline-grid;
    place-items: center;
  }

  .glyph :global(svg) {
    display: block;
    width: var(--size);
    height: var(--size);
  }
</style>
