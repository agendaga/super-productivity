import { TaskState, Task, TaskRelationship } from '../task.model';
import { createMockTask } from '../../../root-store/meta/task-shared-meta-reducers/test-utils';
import { selectRelatedTasks } from './task-relationship.selectors';

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

describe('selectRelatedTasks', () => {
  it('reads an outgoing relationship with its own label', () => {
    const state = stateOf([task('a', [rel('b', 'blocks')]), task('b')]);

    const result = selectRelatedTasks.projector(state, { taskId: 'a' });

    expect(result.map((l) => [l.task.id, l.type])).toEqual([['b', 'blocks']]);
  });

  it('reads an incoming relationship with the inverse label', () => {
    const state = stateOf([task('a'), task('b', [rel('a', 'blocks')])]);

    const result = selectRelatedTasks.projector(state, { taskId: 'a' });

    expect(result.map((l) => [l.task.id, l.type])).toEqual([['b', 'blocked by']]);
  });

  it('reads a canonical relationship from either endpoint with inverse labels', () => {
    const state = stateOf([task('a', [rel('z', 'blocked by')]), task('z')]);

    expect(
      selectRelatedTasks
        .projector(state, { taskId: 'a' })
        .map((l) => [l.task.id, l.type]),
    ).toEqual([['z', 'blocked by']]);
    expect(
      selectRelatedTasks
        .projector(state, { taskId: 'z' })
        .map((l) => [l.task.id, l.type]),
    ).toEqual([['a', 'blocks']]);
  });

  it('merges relationships stored on both ends, each read from the given task', () => {
    const state = stateOf([
      task('a', [rel('b', 'causes')]),
      task('b', [rel('a', 'blocks')]),
      task('c', [rel('a', 'related to')]),
    ]);

    const fromA = selectRelatedTasks.projector(state, { taskId: 'a' });
    const fromB = selectRelatedTasks.projector(state, { taskId: 'b' });

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

    const result = selectRelatedTasks.projector(state, { taskId: 'a' });

    expect(result.map((l) => [l.task.id, l.type])).toEqual([['b', 'blocks']]);
  });

  it('filters dangling target ids', () => {
    const state = stateOf([
      task('a', [rel('gone', 'blocks'), rel('b', 'causes')]),
      task('b'),
    ]);

    const result = selectRelatedTasks.projector(state, { taskId: 'a' });

    expect(result.map((l) => l.task.id)).toEqual(['b']);
  });

  it('omits archived-style targets without changing the stored relationship', () => {
    const source = task('a', [rel('old', 'blocks')]);
    const state = stateOf([source]);

    expect(selectRelatedTasks.projector(state, { taskId: 'a' })).toEqual([]);
    expect(source.relationships).toEqual([rel('old', 'blocks')]);
  });

  it('hides relationships in both panels while either endpoint is a subtask', () => {
    const state = stateOf([
      task('a', [rel('b', 'blocks')]),
      task('b', undefined, { parentId: 'parent' }),
      task('parent', undefined, { subTaskIds: ['b'] }),
    ]);

    expect(selectRelatedTasks.projector(state, { taskId: 'a' })).toEqual([]);
    expect(selectRelatedTasks.projector(state, { taskId: 'b' })).toEqual([]);
    expect(state.entities.a?.relationships).toEqual([rel('b', 'blocks')]);
  });

  it('shows the relationship again after the subtask is promoted', () => {
    const promotedState = stateOf([
      task('a', [rel('b', 'blocks')]),
      task('b'),
      task('parent', undefined, { subTaskIds: [] }),
    ]);

    expect(
      selectRelatedTasks
        .projector(promotedState, { taskId: 'a' })
        .map((l) => [l.task.id, l.type]),
    ).toEqual([['b', 'blocks']]);
    expect(
      selectRelatedTasks
        .projector(promotedState, { taskId: 'b' })
        .map((l) => [l.task.id, l.type]),
    ).toEqual([['a', 'blocked by']]);
  });

  it('returns nothing for a task that is not in the state', () => {
    const state = stateOf([task('b', [rel('a', 'blocks')])]);

    expect(selectRelatedTasks.projector(state, { taskId: 'a' })).toEqual([]);
  });
});
