import type { Page } from '@playwright/test';

/**
 * Turns the Related tasks feature on for this device by dispatching the same
 * persistent action the Settings › App Features switch dispatches (mirrors
 * `updateGlobalConfigSection` in src/app/features/config/store/
 * global-config.actions.ts). Related tasks is opt-in (off in
 * DEFAULT_GLOBAL_CONFIG), so the regular E2E suite — which starts from those
 * defaults — must enable it before a spec can drive related-task UI (rows
 * under titles, card chip, detail panel section).
 *
 * Hand-built as a plain object on purpose: importing the real action creator
 * would pull Angular into the Node test process, which cannot initialize it.
 * Uses the `window.__e2eTestHelpers.store` hook (dev/test builds); the op-log
 * captures and syncs it exactly like a Settings toggle.
 */
export const enableRelatedTasks = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    type StoreLike = { dispatch: (action: unknown) => void };
    const store = (window as unknown as { __e2eTestHelpers?: { store?: StoreLike } })
      .__e2eTestHelpers?.store;
    if (!store) {
      throw new Error('__e2eTestHelpers.store missing — is this a dev/test build?');
    }
    store.dispatch({
      type: '[Global Config] Update Global Config Section',
      sectionKey: 'appFeatures',
      sectionCfg: { isRelatedTasksEnabled: true },
      isSkipSnack: true,
      meta: {
        isPersistent: true,
        entityType: 'GLOBAL_CONFIG',
        entityId: 'appFeatures',
        opType: 'UPD',
      },
    });
  });
};
