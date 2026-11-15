import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, input, output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { NavigateToTaskService } from '../../../../core-ui/navigate-to-task/navigate-to-task.service';
import { TaskService } from '../../task.service';
import { Task, TaskRelationship, TaskState } from '../../task.model';
import { SelectTaskComponent } from '../../select-task/select-task.component';
import { selectAllTasks } from '../../store/task.selectors';
import { selectLinkedTasks } from '../../store/task-relationship.selectors';
import { createMockTask } from '../../../../root-store/meta/task-shared-meta-reducers/test-utils';
import { selectAllProjects } from '../../../project/store/project.selectors';
import { TaskLinkedTasksComponent } from './task-linked-tasks.component';
import { T } from '../../../../t.const';

@Component({
  selector: 'select-task',
  template: '',
})
class SelectTaskStubComponent {
  readonly taskChange = output<Task | string>();
  readonly taskCreate = output<{ title: string; projectId: string | null }>();
  readonly isIncludeParentTasks = input(false);
  readonly excludedTaskIds = input<readonly string[]>([]);
  readonly defaultProjectId = input<string | null>(null);
}

const rel = (targetTaskId: string, type: TaskRelationship['type']): TaskRelationship => ({
  targetTaskId,
  type,
});

const stateOf = (tasks: Task[]): TaskState => ({
  ids: tasks.map((t) => t.id),
  entities: Object.fromEntries(tasks.map((t) => [t.id, t])),
  currentTaskId: null,
  selectedTaskId: null,
  lastCurrentTaskId: null,
  isDataLoaded: true,
});

describe('TaskLinkedTasksComponent', () => {
  let fixture: ComponentFixture<TaskLinkedTasksComponent>;
  let mockTaskService: jasmine.SpyObj<TaskService>;
  let mockNavigate: jasmine.SpyObj<NavigateToTaskService>;

  const setup = async (
    tasks: Task[],
    sourceId: string,
    archivedTasks: Task[] = [],
  ): Promise<void> => {
    const taskState = stateOf(tasks);
    const mockStore = {
      select: (selector: unknown, props?: { taskId: string; archivedTasks?: Task[] }) =>
        selector === selectAllProjects
          ? of([])
          : selector === selectAllTasks
            ? of(tasks)
            : of(selectLinkedTasks.projector(taskState, props ?? { taskId: sourceId })),
      dispatch: () => undefined,
    };
    mockTaskService = jasmine.createSpyObj('TaskService', [
      'update',
      'add',
      'getArchivedTasks',
    ]);
    mockTaskService.getArchivedTasks.and.returnValue(Promise.resolve(archivedTasks));
    mockNavigate = jasmine.createSpyObj('NavigateToTaskService', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [TaskLinkedTasksComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Store, useValue: mockStore },
        { provide: TaskService, useValue: mockTaskService },
        { provide: NavigateToTaskService, useValue: mockNavigate },
      ],
    })
      .overrideComponent(TaskLinkedTasksComponent, {
        remove: { imports: [SelectTaskComponent] },
        add: { imports: [SelectTaskStubComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TaskLinkedTasksComponent);
    fixture.componentRef.setInput(
      'task',
      tasks.find((t) => t.id === sourceId),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const rows = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.linked-tasks__item'));

  const picker = (): SelectTaskStubComponent =>
    fixture.debugElement.query(By.directive(SelectTaskStubComponent))
      .componentInstance as SelectTaskStubComponent;

  const chooseType = (type: string): void => {
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = type;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  it('shows each linked task with the label read from this task', async () => {
    await setup(
      [
        createMockTask({ id: 'a', title: 'Source', relationships: [rel('b', 'blocks')] }),
        createMockTask({ id: 'b', title: 'Target' }),
        createMockTask({
          id: 'c',
          title: 'Blocker',
          relationships: [rel('a', 'blocks')],
        }),
      ],
      'a',
    );

    const texts = rows().map((row) => row.textContent ?? '');
    expect(texts.length).toBe(2);
    expect(texts[0]).toContain(T.F.TASK.LINKED_TASKS.TYPE_BLOCKS);
    expect(texts[0]).toContain('Target');
    expect(texts[1]).toContain(T.F.TASK.LINKED_TASKS.TYPE_BLOCKED_BY);
    expect(texts[1]).toContain('Blocker');
  });

  it('adds the chosen type to this task only, keeping its existing links', async () => {
    await setup(
      [
        createMockTask({ id: 'a', title: 'Source', relationships: [rel('c', 'causes')] }),
        createMockTask({ id: 'b', title: 'Target' }),
        createMockTask({ id: 'c', title: 'Other' }),
      ],
      'a',
    );

    chooseType('causes');
    picker().taskChange.emit(createMockTask({ id: 'b', title: 'Target' }));

    expect(mockTaskService.update).toHaveBeenCalledOnceWith('a', {
      relationships: [rel('c', 'causes'), rel('b', 'causes')],
    });
  });

  it('keeps keys pressed on the type select from reaching the surrounding panel', async () => {
    await setup([createMockTask({ id: 'a', title: 'Source' })], 'a');
    const onKeydown = jasmine.createSpy('onKeydown');
    fixture.nativeElement.addEventListener('keydown', onKeydown);

    fixture.nativeElement
      .querySelector('select')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(onKeydown).not.toHaveBeenCalled();
  });

  it('does not add anything for a typed title that is not a picked task', async () => {
    await setup([createMockTask({ id: 'a', title: 'Source' })], 'a');

    picker().taskChange.emit('half typed');

    expect(mockTaskService.update).not.toHaveBeenCalled();
  });

  describe('targets offered by the picker', () => {
    const excluded = (): readonly string[] => picker().excludedTaskIds();

    it('offers parent tasks as targets', async () => {
      await setup([createMockTask({ id: 'a', title: 'Source' })], 'a');

      expect(picker().isIncludeParentTasks()).toBeTrue();
    });

    it('excludes the source task, its parent and its subtasks', async () => {
      await setup(
        [
          createMockTask({ id: 'p', title: 'Parent', subTaskIds: ['a', 'c'] }),
          createMockTask({ id: 'a', title: 'Source', parentId: 'p', subTaskIds: ['s'] }),
          createMockTask({ id: 's', title: 'Sub', parentId: 'a' }),
          createMockTask({ id: 'c', title: 'Sibling', parentId: 'p' }),
          createMockTask({ id: 'b', title: 'Other' }),
        ],
        'a',
      );

      expect(excluded()).toEqual(jasmine.arrayWithExactContents(['a', 'p', 's']));
    });

    it('excludes targets already linked with the chosen type, stored on either side', async () => {
      await setup(
        [
          createMockTask({
            id: 'a',
            title: 'Source',
            relationships: [rel('b', 'blocks')],
          }),
          createMockTask({ id: 'b', title: 'Target' }),
          createMockTask({
            id: 'c',
            title: 'Mirrored',
            relationships: [rel('a', 'blocked by')],
          }),
          createMockTask({ id: 'd', title: 'Free' }),
        ],
        'a',
      );

      chooseType('blocks');

      expect(excluded()).toEqual(jasmine.arrayWithExactContents(['a', 'b', 'c']));
    });

    it('updates the excluded targets when the chosen type changes', async () => {
      await setup(
        [
          createMockTask({
            id: 'a',
            title: 'Source',
            relationships: [rel('b', 'related to')],
          }),
          createMockTask({ id: 'b', title: 'Target' }),
        ],
        'a',
      );
      expect(excluded()).toContain('b');

      chooseType('blocks');

      expect(excluded()).not.toContain('b');
    });
  });

  it('removes a relationship stored on this task', async () => {
    await setup(
      [
        createMockTask({ id: 'a', title: 'Source', relationships: [rel('b', 'blocks')] }),
        createMockTask({ id: 'b', title: 'Target' }),
      ],
      'a',
    );

    (fixture.nativeElement.querySelector('.linked-tasks__remove') as HTMLElement).click();

    expect(mockTaskService.update).toHaveBeenCalledOnceWith('a', { relationships: [] });
  });

  it('removes a relationship stored on the other task from this end', async () => {
    await setup(
      [
        createMockTask({ id: 'a', title: 'Source' }),
        createMockTask({ id: 'b', title: 'Target', relationships: [rel('a', 'blocks')] }),
      ],
      'a',
    );

    (fixture.nativeElement.querySelector('.linked-tasks__remove') as HTMLElement).click();

    expect(mockTaskService.update).toHaveBeenCalledOnceWith('b', { relationships: [] });
  });

  it('shows a link to an archived task but offers no removal for it', async () => {
    await setup([createMockTask({ id: 'a', title: 'Source' })], 'a', [
      createMockTask({ id: 'c', title: 'Old', relationships: [rel('a', 'blocks')] }),
    ]);

    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain(T.F.TASK.LINKED_TASKS.TYPE_BLOCKED_BY);
    expect(rows()[0].textContent).toContain('Old');
    expect(fixture.nativeElement.querySelector('.linked-tasks__remove')).toBeNull();
  });

  it('opens a linked task, flagging archived targets', async () => {
    await setup(
      [
        createMockTask({
          id: 'a',
          title: 'Source',
          relationships: [rel('b', 'related to'), rel('c', 'related to')],
        }),
        createMockTask({ id: 'b', title: 'Active' }),
      ],
      'a',
      [createMockTask({ id: 'c', title: 'Old' })],
    );

    (rows()[0].querySelector('.linked-tasks__open') as HTMLElement).click();
    (rows()[1].querySelector('.linked-tasks__open') as HTMLElement).click();

    expect(mockNavigate.navigate).toHaveBeenCalledWith('b', false);
    expect(mockNavigate.navigate).toHaveBeenCalledWith('c', true);
  });

  describe('creating a task from the picker', () => {
    it('creates the new task with the inverse relationship in one add call', async () => {
      await setup([createMockTask({ id: 'a', title: 'Source' })], 'a');

      chooseType('blocks');
      picker().taskCreate.emit({ title: 'Blocker', projectId: 'p1' });

      expect(mockTaskService.add).toHaveBeenCalledOnceWith('Blocker', false, {
        projectId: 'p1',
        relationships: [rel('a', 'blocked by')],
      });
      expect(mockTaskService.update).not.toHaveBeenCalled();
    });

    it('stores a related-to link with the same label at both ends', async () => {
      await setup([createMockTask({ id: 'a', title: 'Source' })], 'a');

      picker().taskCreate.emit({ title: 'Peer', projectId: null });

      expect(mockTaskService.add).toHaveBeenCalledOnceWith('Peer', false, {
        relationships: [rel('a', 'related to')],
      });
    });

    it('offers the source task project as the picker default project', async () => {
      await setup([createMockTask({ id: 'a', title: 'Source', projectId: 'work' })], 'a');

      expect(picker().defaultProjectId()).toBe('work');
    });
  });
});
