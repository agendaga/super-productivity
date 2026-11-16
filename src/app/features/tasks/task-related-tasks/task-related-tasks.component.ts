import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { NavigateToTaskService } from '../../../core-ui/navigate-to-task/navigate-to-task.service';
import { DEFAULT_PROJECT_ICON } from '../../project/project.const';
import { Project } from '../../project/project.model';
import { T } from '../../../t.const';
import { isSingleEmoji } from '../../../util/extract-first-emoji';
import { TaskRelationshipDisplayService } from '../task-relationship-display.service';
import { TaskRelationshipType } from '../task.model';
import { LinkedTask } from '../task-relationship.util';

interface RelatedTaskRow {
  task: LinkedTask['task'];
  types: TaskRelationshipType[];
  project?: Project;
  isProjectIconEmoji: boolean;
}

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
  }
};

@Component({
  selector: 'task-related-tasks',
  templateUrl: './task-related-tasks.component.html',
  styleUrl: './task-related-tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, TranslatePipe],
})
export class TaskRelatedTasksComponent {
  private readonly _relationshipDisplay = inject(TaskRelationshipDisplayService);
  private readonly _navigateToTask = inject(NavigateToTaskService);

  readonly taskId = input.required<string>();
  readonly projectId = input.required<string>();
  readonly defaultProjectIcon = DEFAULT_PROJECT_ICON;

  readonly rows = computed(() => {
    const linkedTasks = this._relationshipDisplay.linkedTasksForTask(this.taskId())();
    const projectsById = new Map(
      this._relationshipDisplay.projects().map((project) => [project.id, project]),
    );
    const grouped = new Map<string, RelatedTaskRow>();

    for (const link of linkedTasks) {
      let row = grouped.get(link.task.id);
      if (!row) {
        const project =
          link.task.projectId !== this.projectId()
            ? projectsById.get(link.task.projectId)
            : undefined;
        row = {
          task: link.task,
          types: [],
          project,
          isProjectIconEmoji: !!project?.icon && isSingleEmoji(project.icon),
        };
        grouped.set(link.task.id, row);
      }
      if (!row.types.includes(link.type)) {
        row.types.push(link.type);
      }
    }

    return Array.from(grouped.values()).map((row) => ({
      ...row,
      typeLabelKeys: row.types.map(getTypeLabelKey),
    }));
  });

  openTask(taskId: string): void {
    this._navigateToTask.navigate(taskId, false);
  }
}
