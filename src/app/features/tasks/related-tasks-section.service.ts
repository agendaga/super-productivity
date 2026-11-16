import { Injectable, signal } from '@angular/core';

export interface RelatedTasksSectionRequest {
  taskId: string;
  issuedAt: number;
}

/**
 * How long a request stays eligible to be consumed by the detail panel. If
 * the panel has not shown the requested task within this window (e.g. the
 * user changed selection first), the request expires instead of surprising
 * the user with an expanded section later on.
 */
const REQUEST_TTL_MS = 5000;

/**
 * Transient, UI-only request to open a task's detail panel with its
 * "Related tasks" section expanded and scrolled into view. Deliberately not
 * persisted or synced: it exists only for the click that issues it, so the
 * detail panel has no `TaskDetailTargetPanel` value to store for it.
 */
@Injectable({ providedIn: 'root' })
export class RelatedTasksSectionService {
  private readonly _request = signal<RelatedTasksSectionRequest | null>(null);

  readonly request = this._request.asReadonly();

  requestOpen(taskId: string): void {
    this._request.set({ taskId, issuedAt: Date.now() });
  }

  /**
   * Consumes a live request for `taskId`, returning whether one existed. An
   * expired request is cleared and counts as not consumed.
   */
  consume(taskId: string): boolean {
    const request = this._request();
    if (!request || request.taskId !== taskId) {
      return false;
    }
    this._request.set(null);
    return Date.now() - request.issuedAt <= REQUEST_TTL_MS;
  }
}
