import {
  effect,
  inject,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { selectAllProjects } from '../project/store/project.selectors';
import { selectTaskFeatureState } from './store/task.selectors';
import { RelatedTask, getRelatedTasksByTaskId } from './task-relationship.util';

const EMPTY_RELATIONS: RelatedTask[] = [];

const areSameRelations = (
  a: readonly RelatedTask[],
  b: readonly RelatedTask[],
): boolean =>
  a.length === b.length &&
  a.every(
    (related, index) =>
      related.task === b[index]?.task && related.type === b[index]?.type,
  );

@Injectable({ providedIn: 'root' })
export class TaskRelationshipDisplayService {
  private readonly _store = inject(Store);
  private readonly _taskState = this._store.selectSignal(selectTaskFeatureState);

  readonly projects = this._store.selectSignal(selectAllProjects);

  private _relatedTasksByTaskId = getRelatedTasksByTaskId(this._taskState());
  private readonly _taskRelationsById = new Map<
    string,
    WritableSignal<readonly RelatedTask[]>
  >();

  constructor() {
    effect(() => {
      this._relatedTasksByTaskId = getRelatedTasksByTaskId(this._taskState());
      this._taskRelationsById.forEach((taskRelations, taskId) => {
        const nextRelations = this._relatedTasksByTaskId.get(taskId) ?? EMPTY_RELATIONS;
        if (!areSameRelations(taskRelations(), nextRelations)) {
          taskRelations.set(nextRelations);
        }
      });
    });
  }

  relatedTasksForTask(taskId: string): Signal<readonly RelatedTask[]> {
    let taskRelations = this._taskRelationsById.get(taskId);
    if (!taskRelations) {
      taskRelations = signal(this._relatedTasksByTaskId.get(taskId) ?? EMPTY_RELATIONS);
      this._taskRelationsById.set(taskId, taskRelations);
    }
    return taskRelations.asReadonly();
  }
}
