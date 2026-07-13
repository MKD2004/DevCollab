const TextOperation = require('../src/ot/TextOperation');
const OTDocument = require('../src/ot/OTDocument');

function randomString(len) {
  const chars = 'abcde \n';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Builds a random operation against a document of the given length.
function randomOperation(docLength) {
  const op = new TextOperation();
  let cursor = 0;
  while (cursor < docLength) {
    const choice = Math.random();
    const remaining = docLength - cursor;
    if (choice < 0.2) {
      op.insert(randomString(1 + Math.floor(Math.random() * 4)));
    } else if (choice < 0.5) {
      const n = 1 + Math.floor(Math.random() * remaining);
      op.delete(n);
      cursor += n;
    } else {
      const n = 1 + Math.floor(Math.random() * remaining);
      op.retain(n);
      cursor += n;
    }
  }
  if (Math.random() < 0.3) op.insert(randomString(1 + Math.floor(Math.random() * 4)));
  return op;
}

describe('TextOperation.apply', () => {
  test('retain keeps characters unchanged', () => {
    const op = new TextOperation().retain(5);
    expect(op.apply('hello')).toBe('hello');
  });

  test('insert adds text at cursor', () => {
    const op = new TextOperation().retain(5).insert(' world');
    expect(op.apply('hello')).toBe('hello world');
  });

  test('delete removes text', () => {
    const op = new TextOperation().retain(2).delete(3);
    expect(op.apply('hello')).toBe('he');
  });

  test('combination of retain/insert/delete', () => {
    const op = new TextOperation().retain(2).insert('XY').delete(2).retain(1);
    expect(op.apply('hello')).toBe('heXYo');
  });

  test('throws when base length does not match document', () => {
    const op = new TextOperation().retain(5);
    expect(() => op.apply('nope')).toThrow();
  });

  test('fromJSON / toJSON round-trip', () => {
    const op = new TextOperation().retain(2).insert('hi').delete(1);
    const json = op.toJSON();
    const rebuilt = TextOperation.fromJSON(json);
    expect(rebuilt.apply('abc')).toBe(op.apply('abc'));
  });
});

describe('TextOperation.invert', () => {
  test('applying an operation then its inverse restores the document', () => {
    const doc = 'hello world';
    const op = new TextOperation().retain(6).delete(5).insert('there');
    const inverse = op.invert(doc);
    const applied = op.apply(doc);
    expect(inverse.apply(applied)).toBe(doc);
  });
});

describe('TextOperation.compose', () => {
  test('composing two ops is equivalent to applying them sequentially', () => {
    const doc = 'hello world';
    const op1 = new TextOperation().retain(5).insert(',').retain(6);
    const mid = op1.apply(doc);
    const op2 = new TextOperation().retain(mid.length).insert('!');
    const composed = op1.compose(op2);
    expect(composed.apply(doc)).toBe(op2.apply(mid));
  });
});

describe('TextOperation.transform', () => {
  test('two non-overlapping inserts converge regardless of order', () => {
    const doc = 'hello world';
    // insert 'X' after "hello" (index 5), insert 'Y' after "world" (index 11)
    const a = new TextOperation().retain(5).insert('X').retain(6);
    const b = new TextOperation().retain(11).insert('Y');

    const [aPrime, bPrime] = TextOperation.transform(a, b);

    const docAfterAThenB = bPrime.apply(a.apply(doc));
    const docAfterBThenA = aPrime.apply(b.apply(doc));

    expect(docAfterAThenB).toBe(docAfterBThenA);
    expect(docAfterAThenB).toBe('helloX worldY');
  });

  test('concurrent deletes over overlapping ranges converge', () => {
    const doc = 'abcdef';
    const a = new TextOperation().delete(3).retain(3); // deletes 'abc'
    const b = new TextOperation().retain(1).delete(3).retain(2); // deletes 'bcd'

    const [aPrime, bPrime] = TextOperation.transform(a, b);

    const docAfterAThenB = bPrime.apply(a.apply(doc));
    const docAfterBThenA = aPrime.apply(b.apply(doc));

    expect(docAfterAThenB).toBe(docAfterBThenA);
  });

  test('insert vs delete at the same position converges', () => {
    const doc = 'hello';
    const a = new TextOperation().retain(2).insert('XX').retain(3);
    const b = new TextOperation().retain(2).delete(2).retain(1);

    const [aPrime, bPrime] = TextOperation.transform(a, b);

    const docAfterAThenB = bPrime.apply(a.apply(doc));
    const docAfterBThenA = aPrime.apply(b.apply(doc));

    expect(docAfterAThenB).toBe(docAfterBThenA);
  });

  test('fuzz: random concurrent operations always converge (TP1 property)', () => {
    for (let trial = 0; trial < 200; trial++) {
      const doc = randomString(5 + Math.floor(Math.random() * 15));
      const a = randomOperation(doc.length);
      const b = randomOperation(doc.length);

      const [aPrime, bPrime] = TextOperation.transform(a, b);

      const docAfterAThenB = bPrime.apply(a.apply(doc));
      const docAfterBThenA = aPrime.apply(b.apply(doc));

      expect(docAfterAThenB).toBe(docAfterBThenA);
    }
  });
});

describe('OTDocument', () => {
  test('applies a single client operation and advances revision', () => {
    const otDoc = new OTDocument('hello');
    const op = new TextOperation().retain(5).insert(' world');
    const { operation, revision } = otDoc.applyClientOperation(0, op);

    expect(otDoc.content).toBe('hello world');
    expect(revision).toBe(1);
    expect(operation.apply('hello')).toBe('hello world');
  });

  test('transforms a client op submitted against a stale revision', () => {
    const otDoc = new OTDocument('hello');

    // Client A and B both start from revision 0 == "hello"
    const opA = new TextOperation().retain(5).insert(' A'); // -> "hello A"
    const resultA = otDoc.applyClientOperation(0, opA);
    expect(otDoc.content).toBe('hello A');
    expect(resultA.revision).toBe(1);

    // Client B never saw A's change; still submits against revision 0
    const opB = new TextOperation().retain(5).insert(' B'); // meant to apply to "hello"
    const resultB = otDoc.applyClientOperation(0, opB);

    // B's op gets transformed forward so it applies cleanly to the *current* doc,
    // preserving both edits (exact ordering of same-position inserts is a tie-break
    // detail, not a correctness requirement)
    expect(otDoc.content).toContain(' A');
    expect(otDoc.content).toContain(' B');
    expect(otDoc.content.length).toBe('hello A B'.length);
    expect(resultB.revision).toBe(2);
  });

  test('rejects an operation with an out-of-range revision', () => {
    const otDoc = new OTDocument('hello');
    const op = new TextOperation().retain(5);
    expect(() => otDoc.applyClientOperation(5, op)).toThrow();
    expect(() => otDoc.applyClientOperation(-1, op)).toThrow();
  });

  test('three concurrent clients converge to the same document', () => {
    const server = new OTDocument('start');

    const opA = new TextOperation().retain(5).insert('-A');
    const opB = new TextOperation().retain(5).insert('-B');
    const opC = new TextOperation().retain(0).delete(5).insert('START');

    // all three submitted "simultaneously" against revision 0, applied in
    // arrival order A, B, C — server serializes and transforms each in turn
    server.applyClientOperation(0, opA);
    server.applyClientOperation(0, opB);
    const finalResult = server.applyClientOperation(0, opC);

    expect(server.revision).toBe(3);
    expect(finalResult.revision).toBe(3);
    // Document must reflect all three edits with no data loss/corruption
    expect(server.content).toContain('-A');
    expect(server.content).toContain('-B');
    expect(server.content).toContain('START');
  });
});
