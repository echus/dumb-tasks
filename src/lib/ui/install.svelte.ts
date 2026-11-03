// Installing the app, so it opens like any other app, offline too. Chrome and Edge (on
// Android and computers) have their own install prompt, opened from a button here. Browsers
// without one get the steps instead. Nothing shows once the app runs installed, or in
// browsers that can't install it (Firefox on a computer).

/** Chrome's install prompt, kept from its beforeinstallprompt event until a click opens it */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** How this browser installs the app: its prompt, steps for its menus, or not at all. */
export type InstallWay = 'prompt' | 'ios' | 'mac-safari' | 'android' | null;

export const install = $state({ way: null as InstallWay });

let prompt: InstallPromptEvent | null = null;

/** The way to install from browsers without a prompt, from their user agent. */
export function stepsFor(userAgent: string, touchPoints: number): InstallWay {
  // iPads ask for the desktop site, so they look like Macs, but with a touch screen
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  // Safari 17 (macOS Sonoma) added File > Add to Dock; other Mac browsers have a prompt or none
  const safari = /Macintosh/.test(userAgent) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(userAgent);
  const version = Number(/Version\/(\d+)/.exec(userAgent)?.[1] ?? 0);
  return safari && version >= 17 ? 'mac-safari' : null;
}

type StepsWay = Exclude<InstallWay, 'prompt' | null>;

/** What to do, for the ways without a prompt, in the sync menu. */
export const STEPS: Record<StepsWay, string> = {
  ios: 'To install Dumb Tasks, open the Share menu and tap Add to Home Screen.',
  'mac-safari': 'To install Dumb Tasks, choose File > Add to Dock.',
  android: 'To install Dumb Tasks, open the browser menu and tap Add to Home screen.',
};

function runsInstalled(): boolean {
  // navigator.standalone: an iPhone's home screen app
  return (
    matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  );
}

/** Called once at startup, before the browser's prompt can arrive. */
export function watchInstall() {
  if (runsInstalled()) return;
  install.way = stepsFor(navigator.userAgent, navigator.maxTouchPoints);
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // our button opens it, instead of the browser's own banner
    prompt = e as InstallPromptEvent;
    install.way = 'prompt';
  });
  addEventListener('appinstalled', () => {
    prompt = null;
    install.way = null;
  });
}

/** Opens the browser's install prompt. From a click: the browser allows it only then. */
export async function promptInstall() {
  if (!prompt) return;
  const shown = prompt;
  prompt = null; // a prompt opens once; the browser sends a new one if it's turned down
  await shown.prompt();
  const accepted = (await shown.userChoice).outcome === 'accepted';
  install.way = accepted ? null : stepsFor(navigator.userAgent, navigator.maxTouchPoints);
}
