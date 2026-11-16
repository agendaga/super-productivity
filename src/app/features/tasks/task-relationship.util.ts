import { Task, TaskRelationship, TaskRelationshipType, TaskState } from './task.model';

export interface RelatedTask {
  task: Task;
  /** The relationship read from the task it was asked for (inverse label applied). */
  type: TaskRelationshipType;
}

export const getRelatedTasksByTaskId = (
  taskState: TaskState,
): Map<string, RelatedTask[]> => {
  const relatedTasksByTaskId = new Map<string, RelatedTask[]>();
  const seenByTaskId = new Map<string, Set<string>>();

  const add = (taskId: string, relatedTask: Task, type: TaskRelationshipType): void => {
    if (taskId === relatedTask.id) return;

    let seen = seenByTaskId.get(taskId);
    if (!seen) {
      seen = new Set();
      seenByTaskId.set(taskId, seen);
    }
    const key = `${relatedTask.id}\n${type}`;
    if (seen.has(key)) return;
    seen.add(key);

    let relatedTasks = relatedTasksByTaskId.get(taskId);
    if (!relatedTasks) {
      relatedTasks = [];
      relatedTasksByTaskId.set(taskId, relatedTasks);
    }
    relatedTasks.push({ task: relatedTask, type });
  };

  for (const id of taskState.ids) {
    const holder = taskState.entities[id];
    if (!holder || holder.parentId) continue;

    for (const relationship of holder.relationships ?? []) {
      const target = taskState.entities[relationship.targetTaskId];
      if (target && !target.parentId) {
        add(holder.id, target, relationship.type);
      }
    }
  }

  for (const id of taskState.ids) {
    const holder = taskState.entities[id];
    if (!holder || holder.parentId) continue;

    for (const relationship of holder.relationships ?? []) {
      const target = taskState.entities[relationship.targetTaskId];
      if (target && !target.parentId) {
        add(target.id, holder, getInverseTaskRelationshipType(relationship.type));
      }
    }
  }

  return relatedTasksByTaskId;
};

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
 * Returns the single stored representation for a relationship read from
 * `sourceTaskId`. IDs use JavaScript's deterministic code-unit ordering.
 */
export const getCanonicalTaskRelationship = (
  sourceTaskId: string,
  targetTaskId: string,
  type: TaskRelationshipType,
): { holderTaskId: string; relationship: TaskRelationship } => {
  if (sourceTaskId < targetTaskId) {
    return {
      holderTaskId: sourceTaskId,
      relationship: { targetTaskId, type },
    };
  }
  return {
    holderTaskId: targetTaskId,
    relationship: {
      targetTaskId: sourceTaskId,
      type: getInverseTaskRelationshipType(type),
    },
  };
};

/**
 * The deterministic validity rule for a relationship. Duplicate checking is
 * scoped to the requested list on its canonical holder, not mutable target
 * state, so replay order cannot affect admission.
 */
const isTaskRelationshipAllowed = (
  source: TaskRelationshipEndpoint,
  candidate: TaskRelationship,
  typesReadFromSource: readonly TaskRelationshipType[],
): boolean => {
  if (candidate.targetTaskId === source.id) return false;
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
}: {
  source: TaskRelationshipEndpoint;
  stored: readonly TaskRelationship[];
  requested: readonly TaskRelationship[];
}): TaskRelationship[] => {
  const accepted: TaskRelationship[] = [];

  requested.forEach((candidate) => {
    if (accepted.some((relationship) => isSameRelationship(relationship, candidate))) {
      return;
    }

    const wasStored = stored.some((relationship) =>
      isSameRelationship(relationship, candidate),
    );
    if (wasStored) {
      accepted.push({ ...candidate });
      return;
    }

    const canonical = getCanonicalTaskRelationship(
      source.id,
      candidate.targetTaskId,
      candidate.type,
    );
    if (canonical.holderTaskId !== source.id) return;

    const typesReadFromSource: TaskRelationshipType[] = [
      ...accepted
        .filter((relationship) => relationship.targetTaskId === candidate.targetTaskId)
        .map((relationship) => relationship.type),
    ];
    if (isTaskRelationshipAllowed(source, canonical.relationship, typesReadFromSource)) {
      accepted.push(canonical.relationship);
    }
  });

  return accepted;
};

/**
 * IDs the picker excludes for a new `type` relationship. Parent/subtask
 * exclusion is UX-only; replay admission must not depend on hierarchy state.
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
      const isParentOrSubtask =
        target.id === source.parentId ||
        source.id === target.parentId ||
        !!source.subTaskIds?.includes(target.id) ||
        !!target.subTaskIds?.includes(source.id);
      const typesReadFromSource: TaskRelationshipType[] = [
        ...(source.relationships ?? [])
          .filter((r) => r.targetTaskId === target.id)
          .map((r) => r.type),
        ...(target.relationships ?? [])
          .filter((r) => r.targetTaskId === source.id)
          .map((r) => getInverseTaskRelationshipType(r.type)),
      ];
      return (
        isParentOrSubtask ||
        !isTaskRelationshipAllowed(
          source,
          { targetTaskId: target.id, type },
          typesReadFromSource,
        )
      );
    })
    .map((target) => target.id);

/**
 * Related tasks of `taskId`, merging relationships stored on the task with those
 * stored on other live tasks that point at it. Targets outside the task state
 * are skipped without changing their stored relationships.
 */
export const getRelatedTasks = (taskState: TaskState, taskId: string): RelatedTask[] => {
  const source = taskState.entities[taskId];
  if (!source || source.parentId) return [];

  const result: RelatedTask[] = [];
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
    if (target && !target.parentId) add(target, relationship.type);
  }

  for (const id of taskState.ids) {
    const holder = taskState.entities[id];
    if (!holder || holder.parentId) continue;
    for (const relationship of holder.relationships ?? []) {
      if (relationship.targetTaskId === taskId) {
        add(holder, getInverseTaskRelationshipType(relationship.type));
      }
    }
  }

  return result;
};
