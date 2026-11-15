import { getCanonicalTaskRelationship } from './task-relationship.util';

describe('getCanonicalTaskRelationship', () => {
  it('stores the source reading when the source ID sorts first', () => {
    expect(getCanonicalTaskRelationship('a', 'z', 'blocks')).toEqual({
      holderTaskId: 'a',
      relationship: { targetTaskId: 'z', type: 'blocks' },
    });
  });

  it('stores the inverse reading on the lower-ID task when created from the other end', () => {
    expect(getCanonicalTaskRelationship('z', 'a', 'blocks')).toEqual({
      holderTaskId: 'a',
      relationship: { targetTaskId: 'z', type: 'blocked by' },
    });
  });

  it('compares IDs by deterministic JavaScript code-unit order', () => {
    expect(getCanonicalTaskRelationship('Z', 'a', 'blocks')).toEqual({
      holderTaskId: 'Z',
      relationship: { targetTaskId: 'a', type: 'blocks' },
    });
  });
});
