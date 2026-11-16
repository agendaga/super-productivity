import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { Store } from '@ngrx/store';
import { createMockTask } from '../../root-store/meta/task-shared-meta-reducers/test-utils';
import { Project } from '../project/project.model';
import { selectAllProjects } from '../project/store/project.selectors';
import { TaskState } from './task.model';
import { selectTaskFeatureState } from './store/task.selectors';
import { TaskRelationshipDisplayService } from './task-relationship-display.service';

const stateOf = (tasks: ReturnType<typeof createMockTask>[]): TaskState => ({
  ids: tasks.map((task) => task.id),
  entities: Object.fromEntries(tasks.map((task) => [task.id, task])),
  currentTaskId: null,
  selectedTaskId: null,
  lastCurrentTaskId: null,
  isDataLoaded: true,
});

describe('TaskRelationshipDisplayService', () => {
  let taskState: WritableSignal<TaskState>;
  let projects: WritableSignal<Project[]>;
  let service: TaskRelationshipDisplayService;

  beforeEach(() => {
    taskState = signal(
      stateOf([
        createMockTask({
          id: 'a',
          relationships: [{ targetTaskId: 'b', type: 'blocks' }],
        }),
        createMockTask({ id: 'b', title: 'Target' }),
      ]),
    );
    projects = signal([]);

    TestBed.configureTestingModule({
      providers: [
        TaskRelationshipDisplayService,
        {
          provide: Store,
          useValue: {
            selectSignal: (selector: unknown) => {
              if (selector === selectAllProjects) return projects;
              if (selector === selectTaskFeatureState) return taskState;
              throw new Error('Unexpected selector');
            },
          },
        },
      ],
    });

    service = TestBed.inject(TaskRelationshipDisplayService);
  });

  it('updates both endpoint views when a relationship or related task changes', () => {
    const sourceLinks = service.relatedTasksForTask('a');
    const targetLinks = service.relatedTasksForTask('b');

    expect(sourceLinks().map(({ task, type }) => [task.id, type])).toEqual([
      ['b', 'blocks'],
    ]);
    expect(targetLinks().map(({ task, type }) => [task.id, type])).toEqual([
      ['a', 'blocked by'],
    ]);

    taskState.set(
      stateOf([
        createMockTask({
          id: 'a',
          title: 'Updated source',
          relationships: [{ targetTaskId: 'b', type: 'causes' }],
        }),
        createMockTask({ id: 'b', title: 'Updated target' }),
      ]),
    );
    TestBed.flushEffects();

    expect(sourceLinks().map(({ task, type }) => [task.title, type])).toEqual([
      ['Updated target', 'causes'],
    ]);
    expect(targetLinks().map(({ task, type }) => [task.title, type])).toEqual([
      ['Updated source', 'caused by'],
    ]);
  });
});
