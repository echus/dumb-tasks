<script lang="ts">
  import { dismissToast, toast } from '../lib/ui-state.svelte';
</script>

{#if toast.current}
  {@const current = toast.current}
  <div class="toast" role="status">
    <span>{current.message}</span>
    {#if current.undo}
      <button
        onclick={() => {
          current.undo!();
          dismissToast();
        }}>Undo</button
      >
    {/if}
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: max(20px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 16px;
    max-width: calc(100vw - 32px);
    padding: 10px 12px 10px 16px;
    border-radius: 12px;
    background: var(--toast-bg);
    color: var(--toast-text);
    font-size: 0.9rem;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
  }

  button {
    padding: 4px 8px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--toast-action);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
</style>
