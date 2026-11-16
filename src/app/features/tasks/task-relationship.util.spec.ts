import { createMockTask } from '../../root-store/meta/task-shared-meta-reducers/test-utils';
import { Task, TaskState } from './task.model';
import {
  getCanonicalTaskRelationship,
  getRelatedTasksByTaskId,
} from './task-relationship.util';

const stateOf = (tasks: Task[]): TaskState => ({
  ids: tasks.map((task) => task.id),
  entities: Object.fromEntries(tasks.map((task) => [task.id, task])),
  currentTaskId: null,
  selectedTaskId: null,
  lastCurrentTaskId: null,
  isDataLoaded: true,
});

describe('getCanonicalTaskRelationship', () => {
  it('stores the source reading when the source ID sorts first', () => {
    expect(getCanonicalTaskRelationship('a', 'z', 'blocks')).toEqual({
      holderTaskId: 'a',
      relationship: { targetTaskId: 'z', type: 'blocks' },
    });
  });

  describe('getRelatedTasksByTaskId', () => {
    it('groups every label for each task from both endpoint perspectives', () => {
      const state = stateOf([
        createMockTask({
          id: 'a',
          relationships: [
            { targetTaskId: 'b', type: 'blocks' },
            { targetTaskId: 'b', type: 'causes' },
          ],
        }),
        createMockTask({
          id: 'b',
          relationships: [{ targetTaskId: 'a', type: 'related to' }],
        }),
      ]);

      const linksByTaskId = getRelatedTasksByTaskId(state);

      expect(linksByTaskId.get('a')?.map(({ task, type }) => [task.id, type])).toEqual([
        ['b', 'blocks'],
        ['b', 'causes'],
        ['b', 'related to'],
      ]);
      expect(linksByTaskId.get('b')?.map(({ task, type }) => [task.id, type])).toEqual([
        ['a', 'related to'],
        ['a', 'blocked by'],
        ['a', 'caused by'],
      ]);
    });
  });

  it('stores the inverse reading on the lower-ID task when created from the other end', () => {
    expect(getCanonicalTaskRelationship('z', 'a', 'blocks')).toEqual({
      holderTaskId: 'a',
      relationship: { targetTaskId: 'z', type: 'blocked by' },
    });
  });

  it('compares IDs by deterministic JavaScript code-unit order', () => {
    expect(getCanonicalTaskRelationship('Z', 'a', 'blocks')).toEqual({
      holderTaskId: 'Z',
      relationship: { targetTaskId: 'a', type: 'blocks' },
    });
  });
});
