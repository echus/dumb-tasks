<script lang="ts">
  // Renders one of the bundled Phosphor SVGs (filled, coloured by currentColor).
  // widthRatio is for icons wider than they are tall.
  let { svg, size = 16, widthRatio = 1 }: { svg: string; size?: number; widthRatio?: number } =
    $props();
</script>

<span class="glyph" style:--size="{size}px" style:--width="{size * widthRatio}px" aria-hidden="true"
  >{@html svg}</span
>

<style>
  .glyph {
    display: inline-grid;
    place-items: center;
  }

  .glyph :global(svg) {
    display: block;
    width: var(--width);
    height: var(--size);
  }
</style>
