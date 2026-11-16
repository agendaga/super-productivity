import { createSelector } from '@ngrx/store';
import { getRelatedTasks } from '../task-relationship.util';
import { selectTaskFeatureState } from './task.selectors';

export const selectRelatedTasks = createSelector(
  selectTaskFeatureState,
  (taskState, props: { taskId: string }) => getRelatedTasks(taskState, props.taskId),
);
