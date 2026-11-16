import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { createMockTask } from '../../../root-store/meta/task-shared-meta-reducers/test-utils';
import { Project } from '../../project/project.model';
import { RelatedTasksSectionService } from '../related-tasks-section.service';
import { TaskRelationshipDisplayService } from '../task-relationship-display.service';
import { TaskService } from '../task.service';
import { RelatedTask } from '../task-relationship.util';
import { T } from '../../../t.const';
import { TaskRelatedTasksComponent } from './task-related-tasks.component';

describe('TaskRelatedTasksComponent', () => {
  let fixture: ComponentFixture<TaskRelatedTasksComponent>;
  let related: ReturnType<typeof signal<readonly RelatedTask[]>>;
  let projects: WritableSignal<Project[]>;
  let requestOpen: jasmine.Spy;
  let selectedTaskId: ReturnType<typeof signal<string | null>>;
  let setSelectedId: jasmine.Spy;

  beforeEach(async () => {
    related = signal<readonly RelatedTask[]>([]);
    projects = signal<Project[]>([]);
    requestOpen = jasmine.createSpy('requestOpen');
    selectedTaskId = signal<string | null>(null);
    setSelectedId = jasmine.createSpy('setSelectedId');
    const relationshipDisplay = {
      projects,
      relatedTasksForTask: () => related,
    };

    await TestBed.configureTestingModule({
      imports: [TaskRelatedTasksComponent, TranslateModule.forRoot()],
      providers: [
        { provide: TaskRelationshipDisplayService, useValue: relationshipDisplay },
        { provide: RelatedTasksSectionService, useValue: { requestOpen } },
        {
          provide: TaskService,
          useValue: { selectedTaskId, setSelectedId },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskRelatedTasksComponent);
    fixture.componentRef.setInput('taskId', 'source');
    fixture.componentRef.setInput('projectId', 'current-project');
  });

  it('renders compact one-line rows with the project icon only for other projects', () => {
    const crossProject = createMockTask({
      id: 'target',
      title: 'A related task with a long title',
      projectId: 'other-project',
    });
    const sameProject = createMockTask({
      id: 'same-project',
      title: 'Same project task',
      projectId: 'current-project',
    });
    const project = {
      id: 'other-project',
      title: 'Other project',
      icon: 'work',
      theme: { primary: '#123456' },
    } as Project;
    projects.set([project]);
    related.set([
      { task: crossProject, type: 'blocked by' },
      { task: crossProject, type: 'causes' },
      { task: sameProject, type: 'related to' },
    ]);

    fixture.detectChanges();

    const rows = Array.from(
      fixture.nativeElement.querySelectorAll('.related-tasks__item'),
    ) as HTMLElement[];
    expect(rows).toHaveSize(2);
    expect(rows[0].textContent).toContain(T.F.TASK.RELATED_TASKS.TYPE_BLOCKED_BY);
    expect(rows[0].textContent).toContain(T.F.TASK.RELATED_TASKS.TYPE_CAUSES);
    expect(rows[0].textContent).toContain('A related task with a long title');
    expect(rows[0].querySelector('.related-tasks__project-icon')?.textContent).toContain(
      'work',
    );
    expect(rows[1].querySelector('.related-tasks__project-icon')).toBeNull();
    const projectIcon = fixture.debugElement.query(
      By.css('.related-tasks__project-icon'),
    );
    expect(projectIcon.injector.get(MatTooltip).message).toBe('Other project');
    expect(
      (projectIcon.nativeElement as HTMLElement).hasAttribute('tabindex'),
    ).toBeFalse();

    const openButton = rows[0].querySelector('.related-tasks__open') as HTMLButtonElement;
    expect(getComputedStyle(openButton).pointerEvents).toBe('auto');
    expect(
      getComputedStyle(rows[0].querySelector('.related-tasks__title') as HTMLElement)
        .whiteSpace,
    ).toBe('nowrap');
    expect(
      getComputedStyle(rows[0].querySelector('.related-tasks__title') as HTMLElement)
        .textOverflow,
    ).toBe('ellipsis');
    expect(rows[0].querySelector('.related-tasks__title')?.nextElementSibling).toBe(
      rows[0].querySelector('.related-tasks__project-icon'),
    );
  });

  it('selects this task and requests the related tasks section', () => {
    related.set([
      {
        task: createMockTask({
          id: 'target',
          title: 'Target task',
          projectId: 'other-project',
        }),
        type: 'related to',
      },
    ]);

    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('.related-tasks__open') as HTMLButtonElement
    ).click();

    expect(requestOpen).toHaveBeenCalledOnceWith('source');
    expect(setSelectedId).toHaveBeenCalledOnceWith('source');
  });

  it('requests the section without re-selecting the already-selected task', () => {
    selectedTaskId.set('source');
    related.set([
      {
        task: createMockTask({ id: 'target', title: 'Target task' }),
        type: 'related to',
      },
    ]);

    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('.related-tasks__open') as HTMLButtonElement
    ).click();

    expect(requestOpen).toHaveBeenCalledOnceWith('source');
    expect(setSelectedId).not.toHaveBeenCalled();
  });

  it('shows every related task without a row limit', () => {
    related.set(
      Array.from({ length: 12 }, (_, index) => ({
        task: createMockTask({
          id: `related-${index}`,
          title: `Related task ${index}`,
          projectId: 'current-project',
        }),
        type: 'related to' as const,
      })),
    );

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.related-tasks__item').length).toBe(
      12,
    );
  });
});
