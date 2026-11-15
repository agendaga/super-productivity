import { createSelector } from '@ngrx/store';
import { getLinkedTasks } from '../task-relationship.util';
import { selectTaskFeatureState } from './task.selectors';

export const selectLinkedTasks = createSelector(
  selectTaskFeatureState,
  (taskState, props: { taskId: string }) => getLinkedTasks(taskState, props.taskId),
);
