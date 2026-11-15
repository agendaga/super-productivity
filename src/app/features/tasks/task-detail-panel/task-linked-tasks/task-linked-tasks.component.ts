import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { combineLatest, from } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { T } from '../../../../t.const';
import { NavigateToTaskService } from '../../../../core-ui/navigate-to-task/navigate-to-task.service';
import { selectAllProjects } from '../../../project/store/project.selectors';
import { Project } from '../../../project/project.model';
import { SelectTaskComponent } from '../../select-task/select-task.component';
import { Task, TaskRelationshipType } from '../../task.model';
import { TaskService } from '../../task.service';
import {
  getInverseTaskRelationshipType,
  LinkedTask,
} from '../../task-relationship.util';
import { selectLinkedTasks } from '../../store/task-relationship.selectors';

type LinkableRelationshipType = 'related to' | 'blocks' | 'causes';

const LINKABLE_TYPES: readonly LinkableRelationshipType[] = [
  'related to',
  'blocks',
  'causes',
];

const TYPE_LABEL_KEYS: Record<TaskRelationshipType, string> = {
  'related to': T.F.TASK.LINKED_TASKS.TYPE_RELATED_TO,
  blocks: T.F.TASK.LINKED_TASKS.TYPE_BLOCKS,
  'blocked by': T.F.TASK.LINKED_TASKS.TYPE_BLOCKED_BY,
  causes: T.F.TASK.LINKED_TASKS.TYPE_CAUSES,
  'caused by': T.F.TASK.LINKED_TASKS.TYPE_CAUSED_BY,
};

const isSameRelationship = (
  relationship: { targetTaskId: string; type: TaskRelationshipType },
  targetTaskId: string,
  type: TaskRelationshipType,
): boolean => relationship.targetTaskId === targetTaskId && relationship.type === type;

@Component({
  selector: 'task-linked-tasks',
  templateUrl: './task-linked-tasks.component.html',
  styleUrl: './task-linked-tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MatButton, MatIconButton, MatIcon, SelectTaskComponent],
})
export class TaskLinkedTasksComponent {
  private readonly _store = inject(Store);
  private readonly _taskService = inject(TaskService);
  private readonly _navigateToTaskService = inject(NavigateToTaskService);

  readonly task = input.required<Task>();

  readonly T = T;
  readonly linkableTypes = LINKABLE_TYPES;
  readonly typeLabelKeys = TYPE_LABEL_KEYS;
  readonly selectedType = signal<LinkableRelationshipType>('related to');
  private readonly _pickerKey = signal(0);
  readonly pickerKeys = computed(() => [this._pickerKey()]);

  private readonly _projects = toSignal(this._store.select(selectAllProjects), {
    initialValue: [] as Project[],
  });

  // Archived tasks are not in the active state, but their relationships still
  // count, so they are loaded for the task in view.
  private readonly _archivedTasks = toSignal(
    toObservable(this.task).pipe(
      map((task) => task.id),
      distinctUntilChanged(),
      switchMap(() => from(this._taskService.getArchivedTasks())),
    ),
    { initialValue: [] as Task[] },
  );

  private readonly _linkedTasks = toSignal(
    combineLatest([
      toObservable(this.task).pipe(
        map((task) => task.id),
        distinctUntilChanged(),
      ),
      toObservable(this._archivedTasks),
    ]).pipe(
      switchMap(([taskId, archivedTasks]) =>
        this._store.select(selectLinkedTasks, { taskId, archivedTasks }),
      ),
    ),
    { initialValue: [] as LinkedTask[] },
  );

  readonly rows = computed(() => {
    const task = this.task();
    const archivedIds = new Set(this._archivedTasks().map((t) => t.id));
    const projectsById = new Map(this._projects().map((p) => [p.id, p]));
    return this._linkedTasks().map((link) => {
      const isArchived = archivedIds.has(link.task.id);
      const isStoredHere = (task.relationships ?? []).some((r) =>
        isSameRelationship(r, link.task.id, link.type),
      );
      return {
        key: `${link.task.id}\n${link.type}`,
        link,
        isArchived,
        isStoredHere,
        canRemove: isStoredHere || !isArchived,
        typeLabelKey: TYPE_LABEL_KEYS[link.type],
        projectTitle: link.task.projectId
          ? projectsById.get(link.task.projectId)?.title
          : undefined,
      };
    });
  });

  onTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const type = LINKABLE_TYPES.find((allowed) => allowed === value);
    if (type) {
      this.selectedType.set(type);
    }
  }

  onPickerChange(value: Task | string): void {
    // A typed title that matches nothing is not a link yet.
    if (typeof value === 'string') return;

    const task = this.task();
    this._taskService.update(task.id, {
      relationships: [
        ...(task.relationships ?? []),
        { targetTaskId: value.id, type: this.selectedType() },
      ],
    });
    this._pickerKey.update((key) => key + 1);
  }

  openLinkedTask(row: { link: LinkedTask; isArchived: boolean }): void {
    this._navigateToTaskService.navigate(row.link.task.id, row.isArchived);
  }

  removeLink(row: { link: LinkedTask; isStoredHere: boolean }): void {
    const task = this.task();
    const { link } = row;
    if (row.isStoredHere) {
      this._taskService.update(task.id, {
        relationships: (task.relationships ?? []).filter(
          (r) => !isSameRelationship(r, link.task.id, link.type),
        ),
      });
      return;
    }
    // Stored on the other task: remove it there, read with the inverse label.
    const inverseType = getInverseTaskRelationshipType(link.type);
    this._taskService.update(link.task.id, {
      relationships: (link.task.relationships ?? []).filter(
        (r) => !isSameRelationship(r, task.id, inverseType),
      ),
    });
  }
}
