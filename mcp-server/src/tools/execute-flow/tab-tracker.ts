import type { Page } from 'playwright';

export interface TabSwitchResult {
  page: Page;
  switched: boolean;
}

export async function clickAndMaybeSwitchTab(
  currentPage: Page,
  clickAction: () => Promise<void>,
  timeoutMs = 1200,
): Promise<TabSwitchResult> {
  const popupPromise = currentPage.context().waitForEvent('page', { timeout: timeoutMs }).catch(() => null);

  await clickAction();
  const popup = await popupPromise;

  if (!popup) {
    return { page: currentPage, switched: false };
  }

  try {
    await popup.waitForLoadState('domcontentloaded', {
      timeout: Math.max(3000, timeoutMs * 4),
    });
  } catch {
    // Some pages do not reach domcontentloaded quickly (or at all). Continue with best effort.
  }

  await popup.bringToFront().catch(() => {
    // bringToFront can fail in some headless contexts. Non-fatal.
  });

  return {
    page: popup,
    switched: true,
  };
}
