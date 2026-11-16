import { expect, test } from '../../fixtures/supersync.fixture';
import {
  closeClient,
  createSimulatedClient,
  createTestUser,
  getSuperSyncConfig,
  type SimulatedE2EClient,
} from '../../utils/supersync-helpers';
import { waitForTask } from '../../utils/supersync-helpers';

interface StoredTask {
  id: string;
  title: string;
  parentId?: string;
  relationships: { targetTaskId: string; type: string }[];
}

const blockBackgroundSync = async (client: SimulatedE2EClient): Promise<void> => {
  await client.page.evaluate(() => {
    const flags = globalThis as typeof globalThis & Record<string, boolean>;
    flags['__SP_E2E_BLOCK_AUTO_SYNC'] = true;
    flags['__SP_E2E_BLOCK_WS_DOWNLOAD'] = true;
    flags['__SP_E2E_BLOCK_IMMEDIATE_UPLOAD'] = true;
  });
};

const readTasks = async (
  client: SimulatedE2EClient,
  titles: string[],
): Promise<StoredTask[]> =>
  client.page.evaluate((taskTitles) => {
    type TaskLike = {
      id: string;
      title: string;
      parentId?: string;
      relationships?: { targetTaskId: string; type: string }[];
    };
    type State = {
      tasks?: { entities?: Record<string, TaskLike | undefined> };
      task?: { entities?: Record<string, TaskLike | undefined> };
    };
    const store = (
      window as unknown as {
        __e2eTestHelpers?: {
          store?: {
            subscribe: (next: (state: State) => void) => { unsubscribe: () => void };
          };
        };
      }
    ).__e2eTestHelpers?.store;
    if (!store) throw new Error('__e2eTestHelpers.store missing');
    let state: State | undefined;
    store.subscribe((value) => (state = value)).unsubscribe();
    return taskTitles.map((title) => {
      const task = Object.values(
        state?.tasks?.entities ?? state?.task?.entities ?? {},
      ).find((candidate) => candidate?.title.includes(title));
      if (!task) throw new Error(`Task not found: ${title}`);
      return {
        id: task.id,
        title: task.title,
        ...(task.parentId ? { parentId: task.parentId } : {}),
        relationships: task.relationships ?? [],
      };
    });
  }, titles);

const createRelationship = async (
  client: SimulatedE2EClient,
  sourceTitle: string,
  targetTitle: string,
): Promise<void> => {
  await openLinkedTasks(client, sourceTitle);
  const panel = client.page.locator('task-detail-panel');
  const linkedTasks = panel.locator('task-related-tasks-panel');
  await linkedTasks.locator('select-task input').fill(targetTitle);
  await client.page.getByRole('option', { name: targetTitle }).click();
  await expect(linkedTasks.locator('.related-tasks-panel__item')).toHaveCount(1);
};

const convertToSubTask = async (
  client: SimulatedE2EClient,
  childTitle: string,
  parentTitle: string,
): Promise<void> => {
  await client.page.evaluate(
    ({ child, parent }) => {
      type TaskLike = { id: string; title: string };
      type State = {
        tasks?: { entities?: Record<string, TaskLike | undefined> };
        task?: { entities?: Record<string, TaskLike | undefined> };
      };
      const store = (
        window as unknown as {
          __e2eTestHelpers?: {
            store?: {
              subscribe: (next: (state: State) => void) => {
                unsubscribe: () => void;
              };
              dispatch: (action: unknown) => void;
            };
          };
        }
      ).__e2eTestHelpers?.store;
      if (!store) throw new Error('__e2eTestHelpers.store missing');
      let state: State | undefined;
      store.subscribe((value) => (state = value)).unsubscribe();
      const tasks = Object.values(state?.tasks?.entities ?? state?.task?.entities ?? {});
      const childTask = tasks.find((task) => task?.title.includes(child));
      const parentTask = tasks.find((task) => task?.title.includes(parent));
      if (!childTask || !parentTask) throw new Error('Conversion task not found');
      store.dispatch({
        type: '[Task Shared] convertToSubTask',
        taskId: childTask.id,
        targetParentId: parentTask.id,
        afterTaskId: null,
        meta: {
          isPersistent: true,
          entityType: 'TASK',
          entityId: childTask.id,
          opType: 'UPD',
        },
      });
    },
    { child: childTitle, parent: parentTitle },
  );
};

const openLinkedTasks = async (
  client: SimulatedE2EClient,
  title: string,
): Promise<void> => {
  const taskTitle = client.page.locator(
    'task-detail-panel .task-title-wrapper task-title',
  );
  const header = client.page
    .locator('task-detail-panel mat-expansion-panel-header')
    .filter({ hasText: 'Related tasks' });
  if (!(await taskTitle.isVisible()) || !(await taskTitle.innerText()).includes(title)) {
    // The related-task rows inside a <task> element repeat the related task's
    // title, so a plain hasText filter on <task> matches both ends of a
    // relationship. Anchor on the task's own title element instead.
    const task = client.page.locator('task').filter({
      has: client.page.locator('task-title').filter({ hasText: title }),
    });
    await expect(async () => {
      await task.hover();
      await task
        .getByRole('button', { name: 'Show/hide task panel' })
        .click({ timeout: 2000 });
    }).toPass({ timeout: 15000 });
  }
  await header.waitFor({ state: 'visible' });
  if ((await header.getAttribute('aria-expanded')) !== 'true') {
    await header.click();
  }
};

test.describe('@supersync task relationship convergence', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

  for (const firstUploader of ['A', 'B'] as const) {
    test(`deduplicates opposite-end creates and removes once when ${firstUploader} uploads first`, async ({
      browser,
      baseURL,
      testRunId,
    }) => {
      test.setTimeout(240000);
      const left = `Relationship-left-${testRunId}`;
      const right = `Relationship-right-${testRunId}`;
      const clients: SimulatedE2EClient[] = [];

      try {
        const config = getSuperSyncConfig(await createTestUser(testRunId));
        const clientA = await createSimulatedClient(browser, baseURL!, 'A', testRunId);
        clients.push(clientA);
        await clientA.sync.setupSuperSync(config);
        await clientA.workView.addTask(left);
        await clientA.workView.addTask(right);
        await waitForTask(clientA.page, left);
        await waitForTask(clientA.page, right);
        await clientA.sync.syncAndWait();

        const clientB = await createSimulatedClient(browser, baseURL!, 'B', testRunId);
        clients.push(clientB);
        await clientB.sync.setupSuperSync(config);
        await clientB.sync.syncAndWait();
        await waitForTask(clientB.page, left);
        await waitForTask(clientB.page, right);
        await Promise.all(clients.map(blockBackgroundSync));

        await createRelationship(clientA, left, right);
        await createRelationship(clientB, right, left);

        const [leftTask, rightTask] = await readTasks(clientA, [left, right]);
        const holderTitle = leftTask.id < rightTask.id ? left : right;
        const targetTitle = holderTitle === left ? right : left;
        const uploader = firstUploader === 'A' ? clientA : clientB;
        const other = firstUploader === 'A' ? clientB : clientA;
        await uploader.sync.syncAndWait();
        await other.sync.syncAndWait();
        await uploader.sync.syncAndWait();
        await other.sync.syncAndWait();

        const expected = [
          {
            targetTaskId: (await readTasks(clientA, [targetTitle]))[0].id,
            type: 'related to',
          },
        ];
        const assertCanonicalAndVisible = async (): Promise<void> => {
          for (const client of clients) {
            const tasks = await readTasks(client, [left, right]);
            expect(
              tasks.find((task) => task.title.includes(holderTitle))?.relationships,
            ).toEqual(expected);
            expect(
              tasks.find((task) => task.title.includes(targetTitle))?.relationships,
            ).toEqual([]);
            await openLinkedTasks(client, left);
            await expect(
              client.page.locator('task-related-tasks-panel .related-tasks-panel__item'),
            ).toHaveCount(1);
            await client.page.keyboard.press('Escape');
          }
        };
        await assertCanonicalAndVisible();

        await openLinkedTasks(clientB, targetTitle);
        const removeLink = clientB.page.locator(
          'task-related-tasks-panel .related-tasks-panel__remove',
        );
        await removeLink.focus();
        await removeLink.press('Enter');
        await clientB.sync.syncAndWait();
        await clientA.sync.syncAndWait();

        for (const client of clients) {
          const tasks = await readTasks(client, [left, right]);
          expect(tasks.flatMap((task) => task.relationships)).toEqual([]);
        }
      } finally {
        for (const client of clients) await closeClient(client);
      }
    });
  }

  for (const createFirst of [true, false]) {
    test(`keeps a relationship created ${createFirst ? 'before' : 'after'} subtask conversion`, async ({
      browser,
      baseURL,
      testRunId,
    }) => {
      test.setTimeout(240000);
      const first = `Relationship-first-${testRunId}`;
      const second = `Relationship-second-${testRunId}`;
      const parent = `Relationship-parent-${testRunId}`;
      const clients: SimulatedE2EClient[] = [];

      try {
        const config = getSuperSyncConfig(await createTestUser(testRunId));
        const clientA = await createSimulatedClient(browser, baseURL!, 'A', testRunId);
        clients.push(clientA);
        await clientA.sync.setupSuperSync(config);
        await clientA.workView.addTask(first);
        await clientA.workView.addTask(second);
        await clientA.workView.addTask(parent);
        await Promise.all(
          [first, second, parent].map((title) => waitForTask(clientA.page, title)),
        );
        await clientA.sync.syncAndWait();

        const clientB = await createSimulatedClient(browser, baseURL!, 'B', testRunId);
        clients.push(clientB);
        await clientB.sync.setupSuperSync(config);
        await clientB.sync.syncAndWait();
        await Promise.all(
          [first, second, parent].map((title) => waitForTask(clientB.page, title)),
        );
        await Promise.all(clients.map(blockBackgroundSync));

        const [firstTask, secondTask] = await readTasks(clientA, [first, second]);
        const holderTitle = firstTask.id < secondTask.id ? first : second;
        const targetTitle = holderTitle === first ? second : first;
        const create = (): Promise<void> =>
          createRelationship(clientA, holderTitle, targetTitle);
        const convert = (): Promise<void> =>
          convertToSubTask(clientB, targetTitle, parent);
        if (createFirst) {
          await create();
          await clientA.page.waitForTimeout(50);
          await convert();
          await clientA.sync.syncAndWait();
          await clientB.sync.syncAndWait();
        } else {
          await convert();
          await clientA.page.waitForTimeout(50);
          await create();
          await clientB.sync.syncAndWait();
          await clientA.sync.syncAndWait();
        }
        await clientA.sync.syncAndWait();
        await clientB.sync.syncAndWait();

        const assertConverged = async (): Promise<void> => {
          for (const client of clients) {
            const tasks = await readTasks(client, [first, second, parent]);
            const holder = tasks.find((task) => task.title.includes(holderTitle))!;
            const target = tasks.find((task) => task.title.includes(targetTitle))!;
            expect(target.parentId).toBe(
              tasks.find((task) => task.title.includes(parent))!.id,
            );
            expect(holder.relationships).toEqual([
              { targetTaskId: target.id, type: 'related to' },
            ]);
            await openLinkedTasks(client, holderTitle);
            await expect(
              client.page.locator('task-related-tasks-panel .related-tasks-panel__item'),
            ).toHaveCount(0);
            await client.page.keyboard.press('Escape');
          }
        };
        await assertConverged();
      } finally {
        for (const client of clients) await closeClient(client);
      }
    });
  }
});
