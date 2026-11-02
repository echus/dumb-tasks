import { describe, expect, it } from 'vitest';
import { stepsFor } from '$lib/ui/install.svelte';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const OLD_MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAC_FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0';
const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 15; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0';
const WINDOWS_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';

describe('stepsFor', () => {
  it.each([
    ['iPhone Safari', IPHONE, 0, 'ios'],
    ['iPhone Chrome', IPHONE_CHROME, 5, 'ios'],
    ['iPad, which looks like a Mac but has touch', MAC_SAFARI, 5, 'ios'],
    ['Safari 17+ on a Mac', MAC_SAFARI, 0, 'mac-safari'],
    ['older Safari on a Mac, without Add to Dock', OLD_MAC_SAFARI, 0, null],
    ['Chrome on a Mac, which has its own prompt', MAC_CHROME, 0, null],
    ['Firefox on a Mac, which can\'t install', MAC_FIREFOX, 0, null],
    ['Android browsers until a prompt arrives', ANDROID_FIREFOX, 5, 'android'],
    ['Edge on Windows, which has its own prompt', WINDOWS_EDGE, 0, null],
  ])('%s', (_, userAgent, touchPoints, way) => {
    expect(stepsFor(userAgent, touchPoints)).toBe(way);
  });
});
