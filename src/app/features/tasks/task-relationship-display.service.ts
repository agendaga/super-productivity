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
import { LinkedTask, getLinkedTasksByTaskId } from './task-relationship.util';

const EMPTY_LINKS: LinkedTask[] = [];

const areSameLinks = (a: readonly LinkedTask[], b: readonly LinkedTask[]): boolean =>
  a.length === b.length &&
  a.every((link, index) => link.task === b[index]?.task && link.type === b[index]?.type);

@Injectable({ providedIn: 'root' })
export class TaskRelationshipDisplayService {
  private readonly _store = inject(Store);
  private readonly _taskState = this._store.selectSignal(selectTaskFeatureState);

  readonly projects = this._store.selectSignal(selectAllProjects);

  private _linkedTasksByTaskId = getLinkedTasksByTaskId(this._taskState());
  private readonly _taskLinksById = new Map<
    string,
    WritableSignal<readonly LinkedTask[]>
  >();

  constructor() {
    effect(() => {
      this._linkedTasksByTaskId = getLinkedTasksByTaskId(this._taskState());
      this._taskLinksById.forEach((taskLinks, taskId) => {
        const nextLinks = this._linkedTasksByTaskId.get(taskId) ?? EMPTY_LINKS;
        if (!areSameLinks(taskLinks(), nextLinks)) {
          taskLinks.set(nextLinks);
        }
      });
    });
  }

  linkedTasksForTask(taskId: string): Signal<readonly LinkedTask[]> {
    let taskLinks = this._taskLinksById.get(taskId);
    if (!taskLinks) {
      taskLinks = signal(this._linkedTasksByTaskId.get(taskId) ?? EMPTY_LINKS);
      this._taskLinksById.set(taskId, taskLinks);
    }
    return taskLinks.asReadonly();
  }
}
