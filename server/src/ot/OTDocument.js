const TextOperation = require('./TextOperation');

// Server-side OT document: holds authoritative content plus the full
// history of applied operations, so an operation submitted against an
// older revision can be transformed forward before being applied.
class OTDocument {
  constructor(content = '', language = 'javascript') {
    this.content = content;
    this.language = language;
    this.history = []; // TextOperation[], history[i] takes revision i -> i+1
  }

  get revision() {
    return this.history.length;
  }

  // `revision` is the client's known revision when it created `operation`.
  // Returns { operation: TextOperation, revision } — the transformed
  // operation (safe to apply to the current content) and the resulting
  // revision number.
  applyClientOperation(revision, operation) {
    if (typeof revision !== 'number' || revision < 0 || revision > this.history.length) {
      throw new Error(`invalid revision ${revision}`);
    }
    let transformed = operation;
    const concurrent = this.history.slice(revision);
    for (const historicalOp of concurrent) {
      [transformed] = TextOperation.transform(transformed, historicalOp);
    }

    if (transformed.baseLength !== this.content.length) {
      throw new Error('operation does not apply cleanly to current document');
    }

    this.content = transformed.apply(this.content);
    this.history.push(transformed);

    return { operation: transformed, revision: this.history.length };
  }
}

module.exports = OTDocument;
