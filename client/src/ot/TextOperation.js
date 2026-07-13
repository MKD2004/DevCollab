// Plain-text Operational Transformation core.
//
// An operation is an array of "components" applied left-to-right against a
// cursor moving through the document:
//   - number N > 0  -> retain the next N characters unchanged
//   - string S      -> insert S at the cursor (cursor does not advance in the doc)
//   - number N < 0  -> delete the next -N characters
//
// This mirrors the classic ot.js TextOperation model, which is the standard
// approach for plain-text OT (used by Google Wave / Firepad / ShareJS).
//
// Kept in sync with server/src/ot/TextOperation.js — same algorithm, ported
// to ESM since client and server are separate packages in this monorepo.

export class TextOperation {
  constructor() {
    this.ops = [];
    this.baseLength = 0;
    this.targetLength = 0;
  }

  retain(n) {
    if (typeof n !== 'number' || n < 0) throw new Error('retain expects a non-negative number');
    if (n === 0) return this;
    this.baseLength += n;
    this.targetLength += n;
    const last = this.ops[this.ops.length - 1];
    if (typeof last === 'number' && last > 0) {
      this.ops[this.ops.length - 1] += n;
    } else {
      this.ops.push(n);
    }
    return this;
  }

  insert(str) {
    if (typeof str !== 'string') throw new Error('insert expects a string');
    if (str === '') return this;
    this.targetLength += str.length;
    const last = this.ops[this.ops.length - 1];
    if (typeof last === 'string') {
      this.ops[this.ops.length - 1] += str;
    } else if (typeof last === 'number' && last < 0) {
      // keep delete before insert canonically (delete, insert)
      const secondLast = this.ops[this.ops.length - 2];
      if (typeof secondLast === 'string') {
        this.ops[this.ops.length - 2] += str;
      } else {
        this.ops.splice(this.ops.length - 1, 0, str);
      }
    } else {
      this.ops.push(str);
    }
    return this;
  }

  delete(n) {
    if (typeof n === 'string') n = n.length;
    if (typeof n !== 'number' || n < 0) throw new Error('delete expects a non-negative number');
    if (n === 0) return this;
    this.baseLength += n;
    const last = this.ops[this.ops.length - 1];
    if (typeof last === 'number' && last < 0) {
      this.ops[this.ops.length - 1] -= n;
    } else {
      this.ops.push(-n);
    }
    return this;
  }

  isNoop() {
    return this.ops.length === 0 || (this.ops.length === 1 && typeof this.ops[0] === 'number' && this.ops[0] >= 0);
  }

  toJSON() {
    return this.ops;
  }

  static fromJSON(ops) {
    const op = new TextOperation();
    for (const component of ops) {
      if (typeof component === 'number') {
        if (component > 0) op.retain(component);
        else op.delete(-component);
      } else if (typeof component === 'string') {
        op.insert(component);
      } else {
        throw new Error('invalid operation component');
      }
    }
    return op;
  }

  // Applies this operation to a document string, returning the new string.
  apply(doc) {
    if (doc.length !== this.baseLength) {
      throw new Error(`operation base length (${this.baseLength}) does not match document length (${doc.length})`);
    }
    let cursor = 0;
    const pieces = [];
    for (const component of this.ops) {
      if (typeof component === 'number' && component > 0) {
        pieces.push(doc.slice(cursor, cursor + component));
        cursor += component;
      } else if (typeof component === 'string') {
        pieces.push(component);
      } else if (typeof component === 'number' && component < 0) {
        cursor += -component;
      }
    }
    return pieces.join('');
  }

  // Composes two sequential operations (this, then other) into a single
  // equivalent operation.
  compose(other) {
    if (this.targetLength !== other.baseLength) {
      throw new Error('composed operations must line up: targetLength !== baseLength');
    }
    const result = new TextOperation();
    const ops1 = this.ops.slice();
    const ops2 = other.ops.slice();
    let i1 = 0;
    let i2 = 0;
    let op1 = ops1[i1++];
    let op2 = ops2[i2++];

    for (;;) {
      if (op1 === undefined && op2 === undefined) break;

      if (typeof op1 === 'number' && op1 < 0) {
        result.delete(-op1);
        op1 = ops1[i1++];
        continue;
      }
      if (typeof op2 === 'string') {
        result.insert(op2);
        op2 = ops2[i2++];
        continue;
      }
      if (op1 === undefined || op2 === undefined) {
        throw new Error('operations do not line up for compose');
      }

      if (typeof op1 === 'number' && op1 > 0) {
        if (typeof op2 === 'number' && op2 > 0) {
          if (op1 > op2) {
            result.retain(op2);
            op1 -= op2;
            op2 = ops2[i2++];
          } else if (op1 === op2) {
            result.retain(op1);
            op1 = ops1[i1++];
            op2 = ops2[i2++];
          } else {
            result.retain(op1);
            op2 -= op1;
            op1 = ops1[i1++];
          }
        } else if (typeof op2 === 'number' && op2 < 0) {
          if (op1 > -op2) {
            result.delete(-op2);
            op1 += op2;
            op2 = ops2[i2++];
          } else if (op1 === -op2) {
            result.delete(op1);
            op1 = ops1[i1++];
            op2 = ops2[i2++];
          } else {
            result.delete(op1);
            op2 += op1;
            op1 = ops1[i1++];
          }
        }
        continue;
      }

      if (typeof op1 === 'string') {
        if (typeof op2 === 'number' && op2 > 0) {
          if (op1.length > op2) {
            result.insert(op1.slice(0, op2));
            op1 = op1.slice(op2);
            op2 = ops2[i2++];
          } else if (op1.length === op2) {
            result.insert(op1);
            op1 = ops1[i1++];
            op2 = ops2[i2++];
          } else {
            result.insert(op1);
            op2 -= op1.length;
            op1 = ops1[i1++];
          }
        } else if (typeof op2 === 'number' && op2 < 0) {
          if (op1.length > -op2) {
            op1 = op1.slice(-op2);
            op2 = ops2[i2++];
          } else if (op1.length === -op2) {
            op1 = ops1[i1++];
            op2 = ops2[i2++];
          } else {
            op2 += op1.length;
            op1 = ops1[i1++];
          }
        }
        continue;
      }

      throw new Error('unreachable state in compose');
    }
    return result;
  }

  // Transforms two concurrent operations (a and b), both based on the same
  // document, into (a', b') such that applying a then b' yields the same
  // document as applying b then a'.
  static transform(a, b) {
    const aPrime = new TextOperation();
    const bPrime = new TextOperation();
    const ops1 = a.ops.slice();
    const ops2 = b.ops.slice();
    let i1 = 0;
    let i2 = 0;
    let op1 = ops1[i1++];
    let op2 = ops2[i2++];

    for (;;) {
      if (op1 === undefined && op2 === undefined) break;

      if (typeof op1 === 'string') {
        aPrime.insert(op1);
        bPrime.retain(op1.length);
        op1 = ops1[i1++];
        continue;
      }
      if (typeof op2 === 'string') {
        aPrime.retain(op2.length);
        bPrime.insert(op2);
        op2 = ops2[i2++];
        continue;
      }

      if (op1 === undefined || op2 === undefined) {
        throw new Error('operations do not line up for transform (differing base document)');
      }

      let minLen;
      if (typeof op1 === 'number' && op1 > 0 && typeof op2 === 'number' && op2 > 0) {
        // retain / retain
        if (op1 > op2) {
          minLen = op2;
          op1 -= op2;
          op2 = ops2[i2++];
        } else if (op1 === op2) {
          minLen = op2;
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          minLen = op1;
          op2 -= op1;
          op1 = ops1[i1++];
        }
        aPrime.retain(minLen);
        bPrime.retain(minLen);
      } else if (typeof op1 === 'number' && op1 < 0 && typeof op2 === 'number' && op2 < 0) {
        // delete / delete
        if (-op1 > -op2) {
          op1 -= op2;
          op2 = ops2[i2++];
        } else if (op1 === op2) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op2 -= op1;
          op1 = ops1[i1++];
        }
      } else if (typeof op1 === 'number' && op1 < 0 && typeof op2 === 'number' && op2 > 0) {
        // delete / retain
        if (-op1 > op2) {
          aPrime.delete(op2);
          op1 += op2;
          op2 = ops2[i2++];
        } else if (-op1 === op2) {
          aPrime.delete(-op1);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          aPrime.delete(-op1);
          op2 += op1;
          op1 = ops1[i1++];
        }
      } else if (typeof op1 === 'number' && op1 > 0 && typeof op2 === 'number' && op2 < 0) {
        // retain / delete
        if (op1 > -op2) {
          bPrime.delete(-op2);
          op1 += op2;
          op2 = ops2[i2++];
        } else if (op1 === -op2) {
          bPrime.delete(op1);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          bPrime.delete(op1);
          op2 += op1;
          op1 = ops1[i1++];
        }
      } else {
        throw new Error('unreachable state in transform');
      }
    }
    return [aPrime, bPrime];
  }
}
