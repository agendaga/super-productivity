import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { Store } from '@ngrx/store';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { SelectTaskComponent } from './select-task.component';
import { WorkContextService } from '../../work-context/work-context.service';
import { Task } from '../task.model';
import { Project } from '../../project/project.model';
import { selectAllProjects } from '../../project/store/project.selectors';
import {
  selectStartableTasksWithParentsActiveContextFirst,
  selectStartableTasksWithParentsForActiveContext,
  selectTrackableTasksWithParentsActiveContextFirst,
  selectTrackableTasksWithParentsForActiveContext,
} from '../../work-context/store/work-context.selectors';
import { GlobalConfigService } from '../../config/global-config.service';
import { ShortSyntaxConfig } from '../../config/global-config.model';
import { DEFAULT_GLOBAL_CONFIG } from '../../config/default-global-config.const';

describe('SelectTaskComponent', () => {
  let component: SelectTaskComponent;
  let fixture: ComponentFixture<SelectTaskComponent>;
  let mockStore: jasmine.SpyObj<Store>;
  let tasksSubject: BehaviorSubject<Task[]>;
  let projectsSubject: BehaviorSubject<Project[]>;
  let shortSyntaxConfig: WritableSignal<ShortSyntaxConfig | undefined>;
  let parentTasksSubject: BehaviorSubject<Task[]>;

  const validTask: Task = {
    id: 'task-1',
    title: 'Valid task',
    isDone: false,
    subTaskIds: [],
    tagIds: [],
    parentId: undefined,
  } as Partial<Task> as Task;

  const taskWithUndefinedTitle: Task = {
    id: 'task-2',
    title: undefined,
    isDone: false,
    subTaskIds: [],
    tagIds: [],
    parentId: undefined,
  } as unknown as Task;

  const taskWithNullTitle: Task = {
    id: 'task-3',
    title: null,
    isDone: false,
    subTaskIds: [],
    tagIds: [],
    parentId: undefined,
  } as unknown as Task;

  beforeEach(async () => {
    tasksSubject = new BehaviorSubject<Task[]>([validTask]);
    parentTasksSubject = new BehaviorSubject<Task[]>([validTask]);
    projectsSubject = new BehaviorSubject<Project[]>([]);
    shortSyntaxConfig = signal(DEFAULT_GLOBAL_CONFIG.shortSyntax);

    mockStore = jasmine.createSpyObj('Store', ['select', 'dispatch']);
    mockStore.select.and.callFake((selector) => {
      if (selector === selectAllProjects) return projectsSubject;
      if (
        selector === selectStartableTasksWithParentsActiveContextFirst ||
        selector === selectTrackableTasksWithParentsActiveContextFirst ||
        selector === selectStartableTasksWithParentsForActiveContext ||
        selector === selectTrackableTasksWithParentsForActiveContext
      ) {
        return parentTasksSubject;
      }
      return tasksSubject;
    });

    const mockWorkContextService = jasmine.createSpyObj('WorkContextService', [], {
      startableTasksForActiveContext$: tasksSubject,
      trackableTasksForActiveContext$: tasksSubject,
    });

    await TestBed.configureTestingModule({
      imports: [SelectTaskComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        { provide: Store, useValue: mockStore },
        { provide: WorkContextService, useValue: mockWorkContextService },
        {
          provide: GlobalConfigService,
          useValue: {
            shortSyntax: shortSyntaxConfig,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SelectTaskComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('floats the empty picker label and preserves its suffix icon modes', () => {
    expect(
      fixture.nativeElement.querySelector('mat-form-field').getAttribute('floatlabel'),
    ).toBe('always');
    expect(fixture.nativeElement.querySelector('mat-icon')?.textContent.trim()).toBe(
      'track_changes',
    );

    component.taskSelectCtrl.setValue('new task title');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('mat-icon')?.textContent.trim()).toBe(
      'add',
    );
  });

  describe('filteredTasks', () => {
    it('should filter tasks by search text', () => {
      component.taskSelectCtrl.setValue('valid');
      fixture.detectChanges();
      const result = component.filteredTasks();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('task-1');
    });

    it('should not crash when a task has undefined title', () => {
      tasksSubject.next([validTask, taskWithUndefinedTitle]);
      component.taskSelectCtrl.setValue('valid');
      fixture.detectChanges();
      const result = component.filteredTasks();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('task-1');
    });

    it('should not crash when a task has null title', () => {
      tasksSubject.next([validTask, taskWithNullTitle]);
      component.taskSelectCtrl.setValue('valid');
      fixture.detectChanges();
      const result = component.filteredTasks();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('task-1');
    });

    it('should filter tasks by project short syntax', () => {
      projectsSubject.next([
        { id: 'project-1', title: 'Work' } as Project,
        { id: 'project-2', title: 'Home' } as Project,
      ]);
      tasksSubject.next([
        { ...validTask, id: 'task-1', title: 'Write report', projectId: 'project-1' },
        { ...validTask, id: 'task-2', title: 'Write report', projectId: 'project-2' },
        { ...validTask, id: 'task-3', title: 'Call client', projectId: 'project-1' },
      ]);

      component.taskSelectCtrl.setValue('write +wor');
      fixture.detectChanges();

      const result = component.filteredTasks();
      expect(result.map((task) => task.id)).toEqual(['task-1']);
    });

    it('should show all tasks for a project when only project short syntax is entered', () => {
      projectsSubject.next([
        { id: 'project-1', title: 'Work' } as Project,
        { id: 'project-2', title: 'Home' } as Project,
      ]);
      tasksSubject.next([
        { ...validTask, id: 'task-1', title: 'Write report', projectId: 'project-1' },
        { ...validTask, id: 'task-2', title: 'Do laundry', projectId: 'project-2' },
        { ...validTask, id: 'task-3', title: 'Call client', projectId: 'project-1' },
      ]);

      component.taskSelectCtrl.setValue('+work');
      fixture.detectChanges();

      const result = component.filteredTasks();
      expect(result.map((task) => task.id)).toEqual(['task-1', 'task-3']);
    });

    it('should filter tasks by short syntax for a project hidden from the menu (#11190)', () => {
      projectsSubject.next([
        { id: 'project-1', title: 'Work', isHiddenFromMenu: true } as Project,
        { id: 'project-2', title: 'Home' } as Project,
      ]);
      tasksSubject.next([
        { ...validTask, id: 'task-1', title: 'Write report', projectId: 'project-1' },
        { ...validTask, id: 'task-2', title: 'Write report', projectId: 'project-2' },
      ]);

      component.taskSelectCtrl.setValue('write +wor');
      fixture.detectChanges();

      expect(component.filteredTasks().map((task) => task.id)).toEqual(['task-1']);
    });

    it('should treat project short syntax as literal search text when disabled', () => {
      shortSyntaxConfig.set({
        ...DEFAULT_GLOBAL_CONFIG.shortSyntax,
        isEnableProject: false,
      });
      projectsSubject.next([{ id: 'project-1', title: 'Work' } as Project]);
      tasksSubject.next([
        { ...validTask, id: 'task-1', title: 'Write report', projectId: 'project-1' },
        {
          ...validTask,
          id: 'task-2',
          title: 'Write +wor report',
          projectId: 'project-1',
        },
      ]);

      component.taskSelectCtrl.setValue('write +wor');
      fixture.detectChanges();

      const result = component.filteredTasks();
      expect(result.map((task) => task.id)).toEqual(['task-2']);
    });
  });

  describe('isIncludeParentTasks', () => {
    const parentTask = {
      ...validTask,
      id: 'parent-1',
      title: 'Parent project',
      subTaskIds: ['sub-1'],
    } as Task;

    it('lists parent tasks when turned on', () => {
      parentTasksSubject.next([validTask, parentTask]);
      fixture.componentRef.setInput('isIncludeParentTasks', true);
      fixture.detectChanges();

      component.taskSelectCtrl.setValue('parent');
      fixture.detectChanges();

      expect(component.filteredTasks().map((task) => task.id)).toEqual(['parent-1']);
    });

    it('does not list parent tasks by default', () => {
      parentTasksSubject.next([validTask, parentTask]);

      component.taskSelectCtrl.setValue('parent');
      fixture.detectChanges();

      expect(component.filteredTasks()).toEqual([]);
    });
  });

  describe('isLimitToProject with isIncludeParentTasks', () => {
    const parentTask = {
      ...validTask,
      id: 'parent-1',
      title: 'Parent project',
      subTaskIds: ['sub-1'],
    } as Task;

    it('lists parent tasks of the active context when turned on', () => {
      parentTasksSubject.next([validTask, parentTask]);
      fixture.componentRef.setInput('isLimitToProject', true);
      fixture.componentRef.setInput('isIncludeParentTasks', true);
      fixture.detectChanges();

      component.taskSelectCtrl.setValue('parent');
      fixture.detectChanges();

      expect(component.filteredTasks().map((task) => task.id)).toEqual(['parent-1']);
    });

    it('does not list parent tasks when limited to the project by default', () => {
      parentTasksSubject.next([validTask, parentTask]);
      fixture.componentRef.setInput('isLimitToProject', true);
      fixture.detectChanges();

      component.taskSelectCtrl.setValue('parent');
      fixture.detectChanges();

      expect(component.filteredTasks()).toEqual([]);
    });
  });

  describe('excludedTaskIds', () => {
    const otherTask = { ...validTask, id: 'task-4', title: 'Valid other' } as Task;

    it('never lists an excluded task', () => {
      tasksSubject.next([validTask, otherTask]);
      fixture.componentRef.setInput('excludedTaskIds', ['task-1']);
      fixture.detectChanges();

      component.taskSelectCtrl.setValue('valid');
      fixture.detectChanges();

      expect(component.filteredTasks().map((task) => task.id)).toEqual(['task-4']);
    });

    it('lists every match when nothing is excluded', () => {
      tasksSubject.next([validTask, otherTask]);

      component.taskSelectCtrl.setValue('valid');
      fixture.detectChanges();

      expect(component.filteredTasks().map((task) => task.id)).toEqual([
        'task-1',
        'task-4',
      ]);
    });
  });

  describe('defaultProjectId', () => {
    beforeEach(() => {
      projectsSubject.next([
        { id: 'project-1', title: 'Work' } as Project,
        { id: 'project-2', title: 'Home' } as Project,
      ]);
    });

    it('leaves the create project null by default', () => {
      component.taskSelectCtrl.setValue('Buy milk');
      fixture.detectChanges();

      expect(component.createProjectId()).toBeNull();
    });

    it('is the create project when the typed title names no project', () => {
      fixture.componentRef.setInput('defaultProjectId', 'project-1');
      fixture.detectChanges();

      component.taskSelectCtrl.setValue('Buy milk');
      fixture.detectChanges();

      expect(component.createProjectId()).toBe('project-1');
    });

    it('is overridden by +project in the typed title', () => {
      fixture.componentRef.setInput('defaultProjectId', 'project-1');
      fixture.detectChanges();

      component.taskSelectCtrl.setValue('Buy milk +home');
      fixture.detectChanges();

      expect(component.createProjectId()).toBe('project-2');
    });
  });

  describe('Enter to create', () => {
    let created: { title: string; projectId: string | null }[];

    const pressEnter = (): void => {
      const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();
    };

    beforeEach(() => {
      created = [];
      component.taskCreate.subscribe((request) => created.push(request));
      projectsSubject.next([
        { id: 'project-1', title: 'Work' } as Project,
        { id: 'project-2', title: 'Home' } as Project,
      ]);
    });

    it('emits the typed title and the default project when nothing matches', () => {
      fixture.componentRef.setInput('defaultProjectId', 'project-1');
      fixture.detectChanges();
      component.taskSelectCtrl.setValue('Buy milk');
      fixture.detectChanges();

      pressEnter();

      expect(created).toEqual([{ title: 'Buy milk', projectId: 'project-1' }]);
    });

    it('uses +project in the title over the default project and drops it from the title', () => {
      fixture.componentRef.setInput('defaultProjectId', 'project-1');
      fixture.detectChanges();
      component.taskSelectCtrl.setValue('Buy Milk +home');
      fixture.detectChanges();

      pressEnter();

      expect(created).toEqual([{ title: 'Buy Milk', projectId: 'project-2' }]);
    });

    it('emits no project when the default project is unset', () => {
      component.taskSelectCtrl.setValue('Buy milk');
      fixture.detectChanges();

      pressEnter();

      expect(created).toEqual([{ title: 'Buy milk', projectId: null }]);
    });

    it('does not create when a listed task matches the title', () => {
      component.taskSelectCtrl.setValue('valid');
      fixture.detectChanges();

      pressEnter();

      expect(created).toEqual([]);
    });

    it('does not create when an excluded task has the typed title', () => {
      fixture.componentRef.setInput('excludedTaskIds', ['task-1']);
      fixture.detectChanges();
      component.taskSelectCtrl.setValue('  VALID task ');
      fixture.detectChanges();

      pressEnter();

      expect(created).toEqual([]);
    });

    it('still creates from a partial title that only matches an excluded task', () => {
      fixture.componentRef.setInput('excludedTaskIds', ['task-1']);
      fixture.detectChanges();
      component.taskSelectCtrl.setValue('valid');
      fixture.detectChanges();

      pressEnter();

      expect(created).toEqual([{ title: 'valid', projectId: null }]);
    });

    it('does not create from a title that is only a project', () => {
      component.taskSelectCtrl.setValue('+home');
      fixture.detectChanges();

      pressEnter();

      expect(created).toEqual([]);
    });
  });
});
