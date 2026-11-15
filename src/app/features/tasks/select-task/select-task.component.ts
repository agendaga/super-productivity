import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  Input,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule, ReactiveFormsModule, UntypedFormControl } from '@angular/forms';
import { Task } from '../task.model';
import { combineLatest, Observable } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import { T } from '../../../t.const';
import { WorkContextService } from '../../work-context/work-context.service';
import { Store } from '@ngrx/store';
import {
  selectStartableTasksActiveContextFirst,
  selectStartableTasksWithParentsActiveContextFirst,
  selectTrackableTasksActiveContextFirst,
  selectTrackableTasksWithParentsActiveContextFirst,
} from '../../work-context/store/work-context.selectors';
import { Project } from '../../project/project.model';
import { selectAllProjects } from '../../project/store/project.selectors';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import {
  MatAutocomplete,
  MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
} from '@angular/material/autocomplete';
import { MatIcon } from '@angular/material/icon';
import { MatOption } from '@angular/material/core';
import { TranslatePipe } from '@ngx-translate/core';
// eslint-disable-next-line local-rules/no-sibling-feature-ui -- grandfathered feature-boundary debt (#8299)
import { IssueIconPipe } from '../../issue/issue-icon/issue-icon.pipe';
// eslint-disable-next-line local-rules/no-sibling-feature-ui -- grandfathered feature-boundary debt (#8299)
import { TagComponent } from '../../tag/tag/tag.component';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { parseProjectChanges } from '../short-syntax';
import { MatTooltip } from '@angular/material/tooltip';
import { GlobalConfigService } from '../../config/global-config.service';

@Component({
  selector: 'select-task',
  templateUrl: './select-task.component.html',
  styleUrls: ['./select-task.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatFormField,
    MatLabel,
    MatInput,
    FormsModule,
    MatAutocompleteTrigger,
    ReactiveFormsModule,
    MatIcon,
    MatSuffix,
    MatAutocomplete,
    MatOption,
    TranslatePipe,
    IssueIconPipe,
    TagComponent,
    MatTooltip,
  ],
})
export class SelectTaskComponent {
  private readonly _workContextService = inject(WorkContextService);
  private readonly _globalConfigService = inject(GlobalConfigService);
  private readonly _store = inject(Store);

  T: typeof T = T;
  readonly taskSelectCtrl: UntypedFormControl = new UntypedFormControl('');
  readonly taskChange = output<Task | string>();
  /** Emitted on Enter when the typed title matches no listed task. */
  readonly taskCreate = output<{ title: string; projectId: string | null }>();
  readonly isLimitToProject = input<boolean>(false);
  readonly isIncludeDoneTasks = input<boolean>(false);
  readonly isShowSuggestionsWithoutSearch = input<boolean>(false);
  /** Lets parent tasks (ones with subtasks) be picked. */
  readonly isIncludeParentTasks = input<boolean>(false);
  /** Tasks that never appear in the list. */
  readonly excludedTaskIds = input<readonly string[]>([]);
  /** Project for a task created from the typed title when it names none. */
  readonly defaultProjectId = input<string | null>(null);

  @ViewChild(MatAutocompleteTrigger)
  autocompleteTrigger?: MatAutocompleteTrigger;

  private readonly _projects = toSignal(this._store.select(selectAllProjects), {
    initialValue: [] as Project[],
  });

  private readonly _tasks = toSignal(
    combineLatest([
      toObservable(this.isLimitToProject),
      toObservable(this.isIncludeDoneTasks),
      toObservable(this.isIncludeParentTasks),
    ]).pipe(
      switchMap(([isLimitToProject, isIncludeDoneTasks, isIncludeParentTasks]) =>
        this._selectPickableTasks(
          isLimitToProject,
          isIncludeDoneTasks,
          isIncludeParentTasks,
        ),
      ),
    ),
    { initialValue: [] as Task[] },
  );

  private readonly _excludedIds = computed(() => new Set(this.excludedTaskIds()));

  private readonly _isPanelOpen = signal<boolean>(false);

  private readonly _taskOrTitle = toSignal<Task | string | null>(
    this.taskSelectCtrl.valueChanges.pipe(startWith(this.taskSelectCtrl.value ?? null)),
    { requireSync: true },
  );

  readonly projectMap = computed(() => {
    const projectLookup: { [key: string]: Project } = {};
    for (const project of this._projects()) {
      projectLookup[project.id] = project;
    }
    return projectLookup;
  });

  private readonly _typedText = computed(() => {
    const taskOrTitle = this._taskOrTitle();
    if (typeof taskOrTitle !== 'string') {
      return null;
    }
    const projectParseResult = this._globalConfigService.shortSyntax()?.isEnableProject
      ? parseProjectChanges(
          { title: taskOrTitle },
          this._projects().filter((project) => !project.isArchived),
        )
      : {};
    const title = (projectParseResult.title ?? taskOrTitle).trim();
    return {
      title,
      searchTerm: title.toLowerCase(),
      projectId: projectParseResult.projectId,
    };
  });

  readonly createProjectId = computed(
    () => this._typedText()?.projectId ?? this.defaultProjectId(),
  );

  readonly filteredTasks = computed(() => {
    const typedText = this._typedText();
    if (typedText) {
      const { searchTerm, projectId } = typedText;

      if (!searchTerm && !projectId && !this.isShowSuggestionsWithoutSearch()) {
        return [];
      }

      return this._tasks().filter((task) => {
        if (this._excludedIds().has(task.id)) {
          return false;
        }
        if (projectId && task.projectId !== projectId) {
          return false;
        }
        return !searchTerm || task.title?.toLowerCase().includes(searchTerm);
      });
    }
    return [];
  });

  readonly isCreate = computed(() => {
    if (this._isPanelOpen() && this.filteredTasks().length > 0) {
      return false;
    }
    const taskOrTitle = this._taskOrTitle();
    return typeof taskOrTitle === 'string' && taskOrTitle.trim().length > 0;
  });

  constructor() {
    effect(() => {
      const taskOrTitle = this._taskOrTitle();
      if (taskOrTitle === null) {
        this.taskChange.emit('');
      } else {
        this.taskChange.emit(taskOrTitle);
      }
    });
  }

  private _selectPickableTasks(
    isLimitToProject: boolean,
    isIncludeDoneTasks: boolean,
    isIncludeParentTasks: boolean,
  ): Observable<Task[]> {
    if (isLimitToProject) {
      return isIncludeDoneTasks
        ? this._workContextService.trackableTasksForActiveContext$
        : this._workContextService.startableTasksForActiveContext$;
    }
    if (isIncludeParentTasks) {
      return this._store.select(
        isIncludeDoneTasks
          ? selectTrackableTasksWithParentsActiveContextFirst
          : selectStartableTasksWithParentsActiveContextFirst,
      );
    }
    return this._store.select(
      isIncludeDoneTasks
        ? selectTrackableTasksActiveContextFirst
        : selectStartableTasksActiveContextFirst,
    );
  }

  // TODO: Skipped for migration because:
  //  Accessor inputs cannot be migrated as they are too complex.
  @Input() set initialTask(task: Task) {
    if (task) {
      const currentValue = this.taskSelectCtrl.value;
      const currentTaskId =
        currentValue && typeof currentValue === 'object'
          ? (currentValue as Task).id
          : null;
      if (currentTaskId !== task.id) {
        this.taskSelectCtrl.setValue(task);
      }
    } else if (this.taskSelectCtrl.value) {
      this.taskSelectCtrl.setValue('');
    }
  }

  // Seeds the input with a plain text value (e.g. a new-task title typed in a
  // previous instance), so recreating the component doesn't drop typed text.
  @Input() set initialTitle(title: string | undefined) {
    if (title && !this.taskSelectCtrl.value) {
      this.taskSelectCtrl.setValue(title);
    }
  }

  displayWith(task?: Task): string | undefined {
    // NOTE: apparently task can be undefined for displayWith
    return task?.title;
  }

  onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const selectedTask = event.option.value as Task;
    if (selectedTask) {
      if (this.taskSelectCtrl.value !== selectedTask) {
        this.taskSelectCtrl.setValue(selectedTask);
      }
      this._isPanelOpen.set(false);
    }
  }

  onEnter(): void {
    const typed = this._typedText();
    if (!typed?.title || this.filteredTasks().length > 0) {
      return;
    }
    this.taskCreate.emit({ title: typed.title, projectId: this.createProjectId() });
  }

  onPanelClosed(): void {
    this._isPanelOpen.set(false);
  }

  onPanelOpened(): void {
    this._isPanelOpen.set(true);
  }

  trackById(i: number, task: Task): string {
    return task.id;
  }

  openPanel(): void {
    if (this.autocompleteTrigger && !this.autocompleteTrigger.panelOpen) {
      this.autocompleteTrigger.openPanel();
    }
  }

  isInCreateMode(): boolean {
    return this.isCreate();
  }
}
