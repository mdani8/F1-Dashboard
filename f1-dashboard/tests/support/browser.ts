import type { Browser, Locator, Page } from 'playwright';
import { chromium } from 'playwright';

export function launchBrowser() {
  const executablePath = process.env.BROWSER_EXECUTABLE_PATH;
  return chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
}
const preserveFunctionNames =
  "globalThis.__name = (fn, name) => Object.defineProperty(fn, 'name', {value: name, configurable: true});";
export async function createContext(
  browser: Browser,
  options?: Parameters<Browser['newContext']>[0],
) {
  const context = await browser.newContext(options);
  // tsx preserves function names with this helper. Serialized browser callbacks
  // execute in a separate realm, so install the same helper before navigation.
  await context.addInitScript(preserveFunctionNames);
  return context;
}
export async function createPage(browser: Browser, options?: Parameters<Browser['newPage']>[0]) {
  const page = await browser.newPage(options);
  await page.addInitScript(preserveFunctionNames);
  return page;
}
export function activate(locator: Locator): Promise<void> {
  // Programmatic activation preserves focus and scroll while testing background updates.
  return locator.evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error('Expected an HTML control.');
    element.click();
  });
}
export function waitForApp(page: Page, alignAnimations = false) {
  return page.waitForFunction((align) => {
    if (align) {
      // Virtual polling advances performance.now() independently of Chrome's native animation clock.
      for (const animation of document.getAnimations())
        if (typeof animation.currentTime === 'number' && animation.currentTime < -1000)
          animation.startTime = document.timeline.currentTime;
    }
    if (
      document.body.dataset.appReady !== 'true' ||
      document.querySelector('#refresh')?.getAttribute('aria-disabled') === 'true'
    )
      return false;
    const view = document.querySelector<HTMLElement>('main > [data-page-motion]:not([inert])');
    if (!view || view.dataset.pageMotion !== 'settled') return false;
    if (!location.hash.startsWith('#/weekend')) return view.id === 'dashboard-view';
    if (view.dataset.readyRoute !== location.hash) return false;
    if (view.querySelector('.error-title')) return true;
    const slug = new URLSearchParams(location.hash.split('?')[1] || '').get('session');
    const content = view.querySelector<HTMLElement>(
      '#session-content > [data-content-identity]:not([inert])',
    );
    return content?.dataset.contentIdentity === slug && getComputedStyle(content).opacity === '1';
  }, alignAnimations);
}
export function waitForAnimations(page: Page) {
  return page.waitForFunction(
    () =>
      !document
        .getAnimations()
        .some(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getComputedTiming().iterations !== Infinity,
        ),
  );
}
