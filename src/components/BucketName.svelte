<script lang="ts">
  import Icon from './Icon.svelte';
  import { bucketIcons } from '../lib/ui-icons';
  import { BUCKET_LABELS, type Bucket } from '../lib/types';

  // A bucket's icon and name, for the desktop headings and the phone tabs
  let { bucket }: { bucket: Bucket } = $props();

  const icon = $derived(bucketIcons[bucket]);
</script>

<span class="name">
  <span class="icon"><Icon svg={icon.svg} size={14} widthRatio={icon.widthRatio} /></span>
  {BUCKET_LABELS[bucket]}
</span>

<style>
  .name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  /* Lowercase names: centre on the x-height rather than the line box, which sits a
     little higher */
  .icon {
    display: inline-grid;
    color: var(--muted);
    transform: translateY(0.09em);
  }
</style>
