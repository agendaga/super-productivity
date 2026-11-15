import { createSelector } from '@ngrx/store';
import { Task } from '../task.model';
import { getLinkedTasks } from '../task-relationship.util';
import { selectTaskFeatureState } from './task.selectors';

/**
 * `archivedTasks` is supplied by the caller: archived tasks are not in the task
 * state, so without it their relationships are treated as dangling.
 */
export const selectLinkedTasks = createSelector(
  selectTaskFeatureState,
  (taskState, props: { taskId: string; archivedTasks?: readonly Task[] }) =>
    getLinkedTasks(taskState, props.taskId, props.archivedTasks),
);
