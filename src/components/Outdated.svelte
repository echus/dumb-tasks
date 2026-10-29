<!-- Shown instead of the app when a newer version of it has upgraded this device's tasks -->
<main>
  <p>There is a new version of Dumb Tasks. Reload the app to continue.</p>
  <button onclick={() => location.reload()}>Reload</button>
</main>

<style>
  main {
    padding: 24px 0;
  }

  p {
    margin: 0 0 12px;
  }

  /* Like the sync menu's buttons */
  button {
    padding: 6px 12px;
    border: none;
    border-radius: var(--radius);
    background: none;
    box-shadow: inset 0 0 0 1px var(--border-strong);
    font-size: 0.9em;
    font-weight: 600;
    cursor: pointer;
  }

  button:hover {
    box-shadow: inset 0 0 0 1px var(--accent);
  }
</style>
