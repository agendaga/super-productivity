import { Task, TaskRelationship, TaskRelationshipType, TaskState } from './task.model';

export interface LinkedTask {
  task: Task;
  /** The relationship read from the task it was asked for (inverse label applied). */
  type: TaskRelationshipType;
}

type TaskRelationshipEndpoint = Pick<Task, 'id'> & {
  parentId?: string;
  subTaskIds?: readonly string[];
};

export const getInverseTaskRelationshipType = (
  type: TaskRelationshipType,
): TaskRelationshipType => {
  switch (type) {
    case 'related to':
      return 'related to';
    case 'blocks':
      return 'blocked by';
    case 'blocked by':
      return 'blocks';
    case 'causes':
      return 'caused by';
    case 'caused by':
      return 'causes';
  }
};

export const isSameRelationship = (a: TaskRelationship, b: TaskRelationship): boolean =>
  a.targetTaskId === b.targetTaskId && a.type === b.type;

/**
 * Relationships to store on the other end of a link, without the mirrored
 * entry for `taskId`. `linkType` is the label read from `taskId`, so the entry
 * sits on the other task with the inverse label.
 */
export const withoutMirroredRelationship = (
  relationships: readonly TaskRelationship[] | undefined,
  taskId: string,
  linkType: TaskRelationshipType,
): TaskRelationship[] => {
  const mirrored: TaskRelationship = {
    targetTaskId: taskId,
    type: getInverseTaskRelationshipType(linkType),
  };
  return (relationships ?? []).filter((r) => !isSameRelationship(r, mirrored));
};

/**
 * The one validity rule for a relationship. `typesReadFromSource` lists every
 * relationship type already holding between source and candidate target, read
 * from the source's side (inverse labels applied), so a mirrored duplicate
 * and a repeated type both collide with it.
 */
const isTaskRelationshipAllowed = (
  source: TaskRelationshipEndpoint,
  target: TaskRelationshipEndpoint | undefined,
  candidate: TaskRelationship,
  typesReadFromSource: readonly TaskRelationshipType[],
): boolean => {
  if (candidate.targetTaskId === source.id) return false;
  if (
    target &&
    (target.id === source.parentId ||
      source.id === target.parentId ||
      !!source.subTaskIds?.includes(target.id) ||
      !!target.subTaskIds?.includes(source.id))
  ) {
    return false;
  }
  return !typesReadFromSource.includes(candidate.type);
};

/**
 * Returns the relationships to store on `source`, given the ones stored now and
 * the requested list. Entries already stored are kept without re-checking, so
 * saving an unrelated change never drops a link. New entries must pass the
 * validity rule. Duplicates are dropped.
 */
export const sanitizeTaskRelationships = ({
  source,
  stored,
  requested,
  getTask,
}: {
  source: TaskRelationshipEndpoint;
  stored: readonly TaskRelationship[];
  requested: readonly TaskRelationship[];
  getTask: (id: string) => Task | undefined;
}): TaskRelationship[] => {
  const candidates = requested;
  const accepted = new Set<TaskRelationship>();
  const isAlreadyAccepted = (candidate: TaskRelationship): boolean =>
    [...accepted].some((a) => isSameRelationship(a, candidate));

  candidates.forEach((candidate) => {
    if (
      stored.some((s) => isSameRelationship(s, candidate)) &&
      !isAlreadyAccepted(candidate)
    ) {
      accepted.add(candidate);
    }
  });

  candidates.forEach((candidate) => {
    if (isAlreadyAccepted(candidate)) return;

    const target = getTask(candidate.targetTaskId);
    const typesReadFromSource: TaskRelationshipType[] = [
      ...[...accepted]
        .filter((a) => a.targetTaskId === candidate.targetTaskId)
        .map((a) => a.type),
      ...(target?.relationships ?? [])
        .filter((r) => r.targetTaskId === source.id)
        .map((r) => getInverseTaskRelationshipType(r.type)),
    ];
    if (isTaskRelationshipAllowed(source, target, candidate, typesReadFromSource)) {
      accepted.add(candidate);
    }
  });

  return candidates
    .filter((candidate) => accepted.has(candidate))
    .map(({ targetTaskId, type }) => ({ targetTaskId, type }));
};

/**
 * IDs of the `candidates` that `source` cannot take a new `type` relationship
 * to, by the same rule `sanitizeTaskRelationships` applies on save. Covers the
 * source itself, its parent and subtasks, and targets already linked with
 * `type`, whether stored on the source or as a mirrored entry on the target.
 */
export const getUnlinkableTaskIds = ({
  source,
  type,
  candidates,
}: {
  source: TaskRelationshipEndpoint & { relationships?: readonly TaskRelationship[] };
  type: TaskRelationshipType;
  candidates: readonly (TaskRelationshipEndpoint & {
    relationships?: readonly TaskRelationship[];
  })[];
}): string[] =>
  candidates
    .filter((target) => {
      const typesReadFromSource: TaskRelationshipType[] = [
        ...(source.relationships ?? [])
          .filter((r) => r.targetTaskId === target.id)
          .map((r) => r.type),
        ...(target.relationships ?? [])
          .filter((r) => r.targetTaskId === source.id)
          .map((r) => getInverseTaskRelationshipType(r.type)),
      ];
      return !isTaskRelationshipAllowed(
        source,
        target,
        { targetTaskId: target.id, type },
        typesReadFromSource,
      );
    })
    .map((target) => target.id);

/**
 * Linked tasks of `taskId`, merging relationships stored on the task with those
 * stored on other live tasks that point at it. Targets outside the task state
 * are skipped without changing their stored relationships.
 */
export const getLinkedTasks = (taskState: TaskState, taskId: string): LinkedTask[] => {
  const source = taskState.entities[taskId];
  if (!source) return [];

  const result: LinkedTask[] = [];
  const seen = new Set<string>();
  const add = (task: Task, type: TaskRelationshipType): void => {
    if (task.id === taskId) return;
    const key = `${task.id}\n${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ task, type });
  };

  for (const relationship of source.relationships ?? []) {
    const target = taskState.entities[relationship.targetTaskId];
    if (target) add(target, relationship.type);
  }

  for (const id of taskState.ids) {
    const holder = taskState.entities[id];
    if (!holder) continue;
    for (const relationship of holder.relationships ?? []) {
      if (relationship.targetTaskId === taskId) {
        add(holder, getInverseTaskRelationshipType(relationship.type));
      }
    }
  }

  return result;
};
