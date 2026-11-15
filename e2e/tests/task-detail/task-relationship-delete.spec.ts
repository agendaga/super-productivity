import { type Page } from '@playwright/test';

import { expect, test } from '../../fixtures/test.fixture';
import { cssSelectors } from '../../constants/selectors';

const { DETAIL_PANEL } = cssSelectors;

type StoredTask = {
  id: string;
  relationships: { targetTaskId: string; type: string }[];
};

/**
 * Reads a task's stored relationships from the NgRx store via the
 * `window.__e2eTestHelpers` hook (dev/test builds). The Linked tasks panel
 * hides dangling ids on read, so the panel alone cannot show whether a delete
 * removed the stored link; the store can.
 */
const getStoredTaskByTitle = (page: Page, title: string): Promise<StoredTask | null> =>
  page.evaluate((taskTitle) => {
    type TaskLike = {
      id: string;
      title?: string;
      relationships?: { targetTaskId: string; type: string }[];
    };
    type StoreState = { tasks?: { entities?: Record<string, TaskLike | undefined> } };
    type StoreLike = {
      subscribe: (next: (state: StoreState) => void) => { unsubscribe: () => void };
    };
    const store = (window as unknown as { __e2eTestHelpers?: { store?: StoreLike } })
      .__e2eTestHelpers?.store;
    if (!store) {
      throw new Error('__e2eTestHelpers.store missing');
    }

    let latestState: StoreState | undefined;
    store.subscribe((state) => (latestState = state)).unsubscribe();

    const task = Object.values(latestState?.tasks?.entities ?? {}).find((candidate) =>
      candidate?.title?.includes(taskTitle),
    );
    return task ? { id: task.id, relationships: task.relationships ?? [] } : null;
  }, title);

test.describe('Task relationships: deleting a linked task', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

  test('hides the link while the linked task is deleted and restores it on undo', async ({
    page,
    workViewPage,
    taskPage,
  }) => {
    await workViewPage.waitForTaskList();
    await workViewPage.addTask('Link source');
    await workViewPage.addTask('Link target');

    await taskPage.openTaskDetail(taskPage.getTaskByText('Link source'));
    const panel = page.locator(DETAIL_PANEL);
    await panel
      .locator('mat-expansion-panel-header')
      .filter({ hasText: 'Linked tasks' })
      .click();
    const linkedTasks = panel.locator('task-linked-tasks');

    await linkedTasks.locator('select-task input').fill('Link target');
    await page.locator('mat-option').filter({ hasText: 'Link target' }).click();
    await expect(
      linkedTasks.locator('.linked-tasks__item').filter({ hasText: 'Link target' }),
    ).toBeVisible();

    const target = await getStoredTaskByTitle(page, 'Link target');
    expect(target).not.toBeNull();
    const source = await getStoredTaskByTitle(page, 'Link source');
    expect(source).not.toBeNull();
    const holder = source!.id < target!.id ? source! : target!;
    const other = holder.id === source!.id ? target! : source!;
    const canonicalRelationship = [{ targetTaskId: other.id, type: 'related to' }];
    expect(holder.relationships).toEqual(canonicalRelationship);
    expect(other.relationships).toEqual([]);

    await taskPage.getTaskByText('Link target').click({ button: 'right' });
    await page.locator('.mat-mdc-menu-content button.color-warn').click();
    await page.locator('[e2e="confirmBtn"]').click();
    await expect(taskPage.getTaskByText('Link target')).toHaveCount(0);

    await taskPage.openTaskDetail(taskPage.getTaskByText('Link source'));
    await panel
      .locator('mat-expansion-panel-header')
      .filter({ hasText: 'Linked tasks' })
      .click();
    await expect(linkedTasks.locator('.linked-tasks__item')).toHaveCount(0);
    await expect(linkedTasks.locator('.linked-tasks__empty')).toBeVisible();

    const sourceAfterDelete = await getStoredTaskByTitle(page, 'Link source');
    expect(sourceAfterDelete?.relationships).toEqual(
      holder.id === source!.id ? canonicalRelationship : [],
    );

    const undoButton = page.locator(
      'snack-custom button.action, .mat-mdc-snack-bar-container button',
    );
    await undoButton.waitFor({ state: 'visible', timeout: 5000 });
    await undoButton.click();

    await expect(taskPage.getTaskByText('Link target')).toBeVisible();
    await expect(
      linkedTasks.locator('.linked-tasks__item').filter({ hasText: 'Link target' }),
    ).toBeVisible();
    const sourceAfterRestore = await getStoredTaskByTitle(page, 'Link source');
    const targetAfterRestore = await getStoredTaskByTitle(page, 'Link target');
    expect(sourceAfterRestore).not.toBeNull();
    expect(targetAfterRestore).not.toBeNull();
    const restoredHolder =
      sourceAfterRestore!.id < targetAfterRestore!.id
        ? sourceAfterRestore!
        : targetAfterRestore!;
    const restoredOther =
      restoredHolder.id === sourceAfterRestore!.id
        ? targetAfterRestore!
        : sourceAfterRestore!;
    expect(restoredHolder.relationships).toEqual([
      { targetTaskId: restoredOther.id, type: 'related to' },
    ]);
    expect(restoredOther.relationships).toEqual([]);
  });
});
