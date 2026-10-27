type Theme = 'system' | 'light' | 'dark';

const BG = { dark: '#000000', light: '#f5f5f5' };

function read(): Theme {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage blocked: fall back to the system setting.
  }
  return 'system';
}

const systemQuery = typeof window !== 'undefined' ? matchMedia('(prefers-color-scheme: light)') : null;

// Follows the system until the user flips the toggle; after that their choice sticks.
const theme = $state({ current: read(), systemLight: systemQuery?.matches ?? false });

export function effectiveTheme(): 'light' | 'dark' {
  if (theme.current !== 'system') return theme.current;
  return theme.systemLight ? 'light' : 'dark';
}

/** The browser chrome colour (address bar, Android task switcher) follows the page. */
function syncThemeColor() {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = BG[effectiveTheme()];
  }
}

function setTheme(next: Theme) {
  theme.current = next;
  try {
    if (next === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', next);
  } catch {
    // Not persisted, but still applied for this visit.
  }
  if (next === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  syncThemeColor();
}

export function toggleTheme() {
  setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
}

if (systemQuery) {
  syncThemeColor();
  systemQuery.addEventListener('change', (e) => {
    theme.systemLight = e.matches;
    syncThemeColor();
  });
}
