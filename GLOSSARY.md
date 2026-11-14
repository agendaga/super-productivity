# Glossary

Domain terms for Super Productivity. Definitions describe what a term means in the product, not how it is built.

**Task relationship**:
A link from one task to another task, expressing how the two relate. It is separate from the subtask relation, which means "part of".
_Avoid_: dependency (too narrow; not every relationship is a dependency), subtask link

**Relationship type**:
The kind of a task relationship: `related to`, `blocks`, or `causes`. The set is fixed by the product.
_Avoid_: link kind, category

**Source task**:
The task a task relationship is read from. The relationship can be read from either end.

**Target task**:
The task at the other end of a task relationship.

**Inverse label**:
The reading of a task relationship from the other end, for example `blocks` read from the target is `blocked by`. A relationship and its inverse are the same fact and are never counted twice.

**Blocked by**:
The inverse label of `blocks`: the task's work waits on another task. Informational only; it changes no behavior.

**Linked task**:
A task that is the source or target of a task relationship with the task currently in view.
