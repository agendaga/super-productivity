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
import { distinctUntilChanged, map, switchMap } from 'rxjs';
import { T } from '../../../../t.const';
import { NavigateToTaskService } from '../../../../core-ui/navigate-to-task/navigate-to-task.service';
import { selectAllProjects } from '../../../project/store/project.selectors';
import { Project } from '../../../project/project.model';
import { SelectTaskComponent } from '../../select-task/select-task.component';
import {
  Task,
  TaskRelationship,
  TaskRelationshipType,
  TASK_RELATIONSHIP_TYPES,
} from '../../task.model';
import { TaskService } from '../../task.service';
import {
  getCanonicalTaskRelationship,
  getInverseTaskRelationshipType,
  getUnlinkableTaskIds,
  isSameRelationship,
  LinkedTask,
} from '../../task-relationship.util';
import { selectAllTasks } from '../../store/task.selectors';
import { selectLinkedTasks } from '../../store/task-relationship.selectors';

const getTypeLabelKey = (type: TaskRelationshipType): string => {
  switch (type) {
    case 'related to':
      return T.F.TASK.LINKED_TASKS.TYPE_RELATED_TO;
    case 'blocks':
      return T.F.TASK.LINKED_TASKS.TYPE_BLOCKS;
    case 'blocked by':
      return T.F.TASK.LINKED_TASKS.TYPE_BLOCKED_BY;
    case 'causes':
      return T.F.TASK.LINKED_TASKS.TYPE_CAUSES;
    case 'caused by':
      return T.F.TASK.LINKED_TASKS.TYPE_CAUSED_BY;
    default: {
      const unreachable: never = type;
      return unreachable;
    }
  }
};

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
  readonly linkableTypes = TASK_RELATIONSHIP_TYPES;
  readonly typeLabelKeyOf = getTypeLabelKey;
  readonly selectedType = signal<TaskRelationshipType>('related to');
  // Bumping the key re-creates the picker after a pick, which clears its typed text.
  private readonly _pickerRemountKey = signal(0);
  readonly pickerRemountKeys = computed(() => [this._pickerRemountKey()]);
  readonly sourceProjectId = computed(() => this.task().projectId || null);

  private readonly _projects = toSignal(this._store.select(selectAllProjects), {
    initialValue: [] as Project[],
  });

  private readonly _allTasks = toSignal(this._store.select(selectAllTasks), {
    initialValue: [] as Task[],
  });

  readonly excludedTaskIds = computed(() =>
    getUnlinkableTaskIds({
      source: this.task(),
      type: this.selectedType(),
      candidates: this._allTasks(),
    }),
  );

  private readonly _linkedTasks = toSignal(
    toObservable(this.task).pipe(
      map((task) => task.id),
      distinctUntilChanged(),
      switchMap((taskId) => this._store.select(selectLinkedTasks, { taskId })),
    ),
    { initialValue: [] as LinkedTask[] },
  );

  readonly rows = computed(() => {
    const task = this.task();
    const projectsById = new Map(this._projects().map((p) => [p.id, p]));
    return this._linkedTasks().map((link) => {
      const linkRelationship: TaskRelationship = {
        targetTaskId: link.task.id,
        type: link.type,
      };
      const isStoredHere = (task.relationships ?? []).some((r) =>
        isSameRelationship(r, linkRelationship),
      );
      return {
        key: `${link.task.id}\n${link.type}`,
        link,
        isStoredHere,
        typeLabelKey: getTypeLabelKey(link.type),
        projectTitle: link.task.projectId
          ? projectsById.get(link.task.projectId)?.title
          : undefined,
      };
    });
  });

  onTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const type = TASK_RELATIONSHIP_TYPES.find((allowed) => allowed === value);
    if (type) {
      this.selectedType.set(type);
    }
  }

  onPickerChange(value: Task | string): void {
    // A typed title that matches nothing is not a link yet.
    if (typeof value === 'string') return;

    const canonical = getCanonicalTaskRelationship(
      this.task().id,
      value.id,
      this.selectedType(),
    );
    const holder = this._allTasks().find(
      (candidate) => candidate.id === canonical.holderTaskId,
    );
    if (!holder) {
      throw new Error(`Task relationship holder not found: ${canonical.holderTaskId}`);
    }
    if (
      !(holder.relationships ?? []).some((relationship) =>
        isSameRelationship(relationship, canonical.relationship),
      )
    ) {
      this._taskService.update(holder.id, {
        relationships: [...(holder.relationships ?? []), canonical.relationship],
      });
    }
    this._pickerRemountKey.update((key) => key + 1);
  }

  onPickerCreate(request: { title: string; projectId: string | null }): void {
    const task = this.task();
    const newTaskId = this._taskService.add(request.title, false, {
      ...(request.projectId ? { projectId: request.projectId } : {}),
    });
    // The relationship owner cannot be known until add() assigns the new ID.
    const canonical = getCanonicalTaskRelationship(
      task.id,
      newTaskId,
      this.selectedType(),
    );
    const holderId = canonical.holderTaskId;
    const holderRelationships = holderId === newTaskId ? [] : (task.relationships ?? []);
    this._taskService.update(holderId, {
      relationships: [...holderRelationships, canonical.relationship],
    });
    this._pickerRemountKey.update((key) => key + 1);
  }

  openLinkedTask(link: LinkedTask): void {
    this._navigateToTaskService.navigate(link.task.id, false);
  }

  removeLink(row: { link: LinkedTask; isStoredHere: boolean }): void {
    const task = this.task();
    const { link } = row;
    const canonical = getCanonicalTaskRelationship(task.id, link.task.id, link.type);
    const holder = canonical.holderTaskId === task.id ? task : link.task;
    const other = holder.id === task.id ? link.task : task;
    const holderRelationships = (holder.relationships ?? []).filter(
      (relationship) => !isSameRelationship(relationship, canonical.relationship),
    );
    if (holderRelationships.length !== (holder.relationships ?? []).length) {
      this._taskService.update(holder.id, { relationships: holderRelationships });
    }

    const mirrored = {
      targetTaskId: holder.id,
      type: getInverseTaskRelationshipType(canonical.relationship.type),
    };
    const otherRelationships = (other.relationships ?? []).filter(
      (relationship) => !isSameRelationship(relationship, mirrored),
    );
    if (otherRelationships.length !== (other.relationships ?? []).length) {
      this._taskService.update(other.id, { relationships: otherRelationships });
    }
  }
}
