import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { DEFAULT_PROJECT_ICON } from '../../project/project.const';
import { Project } from '../../project/project.model';
import { T } from '../../../t.const';
import { isSingleEmoji } from '../../../util/extract-first-emoji';
import { RelatedTasksSectionService } from '../related-tasks-section.service';
import { TaskRelationshipDisplayService } from '../task-relationship-display.service';
import { TaskService } from '../task.service';
import { TaskRelationshipType } from '../task.model';
import { RelatedTask } from '../task-relationship.util';

interface RelatedTaskRow {
  task: RelatedTask['task'];
  types: TaskRelationshipType[];
  project?: Project;
  isProjectIconEmoji: boolean;
}

const getTypeLabelKey = (type: TaskRelationshipType): string => {
  switch (type) {
    case 'related to':
      return T.F.TASK.RELATED_TASKS.TYPE_RELATED_TO;
    case 'blocks':
      return T.F.TASK.RELATED_TASKS.TYPE_BLOCKS;
    case 'blocked by':
      return T.F.TASK.RELATED_TASKS.TYPE_BLOCKED_BY;
    case 'causes':
      return T.F.TASK.RELATED_TASKS.TYPE_CAUSES;
    case 'caused by':
      return T.F.TASK.RELATED_TASKS.TYPE_CAUSED_BY;
  }
};

@Component({
  selector: 'task-related-tasks',
  templateUrl: './task-related-tasks.component.html',
  styleUrl: './task-related-tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, MatTooltip, TranslatePipe],
})
export class TaskRelatedTasksComponent {
  private readonly _relationshipDisplay = inject(TaskRelationshipDisplayService);
  private readonly _relatedTasksSection = inject(RelatedTasksSectionService);
  private readonly _taskService = inject(TaskService);

  readonly taskId = input.required<string>();
  readonly projectId = input.required<string>();
  readonly defaultProjectIcon = DEFAULT_PROJECT_ICON;

  readonly rows = computed(() => {
    const relatedTasks = this._relationshipDisplay.relatedTasksForTask(this.taskId())();
    const projectsById = new Map(
      this._relationshipDisplay.projects().map((project) => [project.id, project]),
    );
    const grouped = new Map<string, RelatedTaskRow>();

    for (const related of relatedTasks) {
      let row = grouped.get(related.task.id);
      if (!row) {
        const project =
          related.task.projectId !== this.projectId()
            ? projectsById.get(related.task.projectId)
            : undefined;
        row = {
          task: related.task,
          types: [],
          project,
          isProjectIconEmoji: !!project?.icon && isSingleEmoji(project.icon),
        };
        grouped.set(related.task.id, row);
      }
      if (!row.types.includes(related.type)) {
        row.types.push(related.type);
      }
    }

    return Array.from(grouped.values()).map((row) => ({
      ...row,
      typeLabelKeys: row.types.map(getTypeLabelKey),
    }));
  });

  /**
   * Opens this task's detail panel with its "Related tasks" section expanded,
   * rather than navigating to the related task — the panel's rows are the way
   * to reach it. Re-selecting an already-selected task would toggle the panel
   * closed, so only select when the task is not selected yet.
   */
  openRelatedTasksSection(ev: MouseEvent): void {
    ev.stopPropagation();
    this._relatedTasksSection.requestOpen(this.taskId());
    if (this._taskService.selectedTaskId() !== this.taskId()) {
      this._taskService.setSelectedId(this.taskId());
    }
  }
}
