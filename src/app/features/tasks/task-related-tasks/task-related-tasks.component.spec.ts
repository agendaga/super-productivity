import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NavigateToTaskService } from '../../../core-ui/navigate-to-task/navigate-to-task.service';
import { createMockTask } from '../../../root-store/meta/task-shared-meta-reducers/test-utils';
import { Project } from '../../project/project.model';
import { TaskRelationshipDisplayService } from '../task-relationship-display.service';
import { LinkedTask } from '../task-relationship.util';
import { T } from '../../../t.const';
import { TaskRelatedTasksComponent } from './task-related-tasks.component';

describe('TaskRelatedTasksComponent', () => {
  let fixture: ComponentFixture<TaskRelatedTasksComponent>;
  let links: ReturnType<typeof signal<readonly LinkedTask[]>>;
  let projects: WritableSignal<Project[]>;
  let navigate: jasmine.SpyObj<NavigateToTaskService>;

  beforeEach(async () => {
    links = signal<readonly LinkedTask[]>([]);
    projects = signal<Project[]>([]);
    navigate = jasmine.createSpyObj('NavigateToTaskService', ['navigate']);
    const relationshipDisplay = {
      projects,
      linkedTasksForTask: () => links,
    };

    await TestBed.configureTestingModule({
      imports: [TaskRelatedTasksComponent, TranslateModule.forRoot()],
      providers: [
        { provide: TaskRelationshipDisplayService, useValue: relationshipDisplay },
        { provide: NavigateToTaskService, useValue: navigate },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskRelatedTasksComponent);
    fixture.componentRef.setInput('taskId', 'source');
    fixture.componentRef.setInput('projectId', 'current-project');
  });

  it('shows each related task once with all labels and its other project details', () => {
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
    links.set([
      { task: crossProject, type: 'blocked by' },
      { task: crossProject, type: 'causes' },
      { task: sameProject, type: 'related to' },
    ]);

    fixture.detectChanges();

    const rows = Array.from(
      fixture.nativeElement.querySelectorAll('.related-tasks__item'),
    ) as HTMLElement[];
    expect(rows).toHaveSize(2);
    expect(rows[0].textContent).toContain(T.F.TASK.LINKED_TASKS.TYPE_BLOCKED_BY);
    expect(rows[0].textContent).toContain(T.F.TASK.LINKED_TASKS.TYPE_CAUSES);
    expect(rows[0].textContent).toContain('A related task with a long title');
    expect(rows[0].querySelector('.related-tasks__project')?.textContent).toContain(
      'Other project',
    );
    expect(rows[0].querySelector('.related-tasks__project-icon')?.textContent).toContain(
      'work',
    );
    expect(rows[1].querySelector('.related-tasks__project')).toBeNull();
    expect(
      getComputedStyle(rows[0].querySelector('.related-tasks__open') as HTMLButtonElement)
        .pointerEvents,
    ).toBe('auto');

    (rows[0].querySelector('.related-tasks__open') as HTMLButtonElement).click();

    expect(navigate.navigate).toHaveBeenCalledOnceWith('target', false);
  });

  it('shows every related task without a row limit', () => {
    links.set(
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
