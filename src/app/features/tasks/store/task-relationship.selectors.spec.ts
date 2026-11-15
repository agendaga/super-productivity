import { getLinkedTasks } from '../task-relationship.util';
import { TaskState, Task, TaskRelationship } from '../task.model';
import { createMockTask } from '../../../root-store/meta/task-shared-meta-reducers/test-utils';
import { selectLinkedTasks } from './task-relationship.selectors';

const stateOf = (tasks: Task[]): TaskState => ({
  ids: tasks.map((t) => t.id),
  entities: Object.fromEntries(tasks.map((t) => [t.id, t])),
  currentTaskId: null,
  selectedTaskId: null,
  lastCurrentTaskId: null,
  isDataLoaded: true,
});

const task = (
  id: string,
  relationships?: TaskRelationship[],
  extra: Partial<Task> = {},
): Task => createMockTask({ id, relationships, ...extra });

const rel = (targetTaskId: string, type: TaskRelationship['type']): TaskRelationship => ({
  targetTaskId,
  type,
});

describe('selectLinkedTasks', () => {
  it('reads an outgoing relationship with its own label', () => {
    const state = stateOf([task('a', [rel('b', 'blocks')]), task('b')]);

    const result = selectLinkedTasks.projector(state, { taskId: 'a' });

    expect(result.map((l) => [l.task.id, l.type])).toEqual([['b', 'blocks']]);
  });

  it('reads an incoming relationship with the inverse label', () => {
    const state = stateOf([task('a'), task('b', [rel('a', 'blocks')])]);

    const result = selectLinkedTasks.projector(state, { taskId: 'a' });

    expect(result.map((l) => [l.task.id, l.type])).toEqual([['b', 'blocked by']]);
  });

  it('merges relationships stored on both ends, each read from the given task', () => {
    const state = stateOf([
      task('a', [rel('b', 'causes')]),
      task('b', [rel('a', 'blocks')]),
      task('c', [rel('a', 'related to')]),
    ]);

    const fromA = selectLinkedTasks.projector(state, { taskId: 'a' });
    const fromB = selectLinkedTasks.projector(state, { taskId: 'b' });

    expect(fromA.map((l) => [l.task.id, l.type])).toEqual([
      ['b', 'causes'],
      ['b', 'blocked by'],
      ['c', 'related to'],
    ]);
    expect(fromB.map((l) => [l.task.id, l.type])).toEqual([
      ['a', 'blocks'],
      ['a', 'caused by'],
    ]);
  });

  it('shows the same fact once when both ends store it', () => {
    const state = stateOf([
      task('a', [rel('b', 'blocks')]),
      task('b', [rel('a', 'blocked by')]),
    ]);

    const result = selectLinkedTasks.projector(state, { taskId: 'a' });

    expect(result.map((l) => [l.task.id, l.type])).toEqual([['b', 'blocks']]);
  });

  it('filters dangling target ids', () => {
    const state = stateOf([
      task('a', [rel('gone', 'blocks'), rel('b', 'causes')]),
      task('b'),
    ]);

    const result = selectLinkedTasks.projector(state, { taskId: 'a' });

    expect(result.map((l) => l.task.id)).toEqual(['b']);
  });

  it('keeps archived targets when the caller supplies the archive', () => {
    const archived = task('old', undefined, { isDone: true });
    const state = stateOf([task('a', [rel('old', 'blocks')])]);

    expect(
      getLinkedTasks(state, 'a', [archived]).map((l) => [l.task.id, l.type]),
    ).toEqual([['old', 'blocks']]);
    expect(getLinkedTasks(state, 'a').length).toBe(0);
  });

  it('returns nothing for a task that is not in the state', () => {
    const state = stateOf([task('b', [rel('a', 'blocks')])]);

    expect(selectLinkedTasks.projector(state, { taskId: 'a' })).toEqual([]);
  });
});
