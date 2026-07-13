import { TextOperation } from './TextOperation';

// Classic ot.js client-side state machine. Guarantees at most one
// unacknowledged operation is ever in flight to the server, buffering any
// further local edits until that ack arrives — this is what makes rapid
// typing safe without an artificial debounce.
//
// States:
//   synchronized       — no outstanding operation, editor matches server at `revision`
//   awaitingConfirm     — `outstanding` sent to server, no ack yet
//   awaitingWithBuffer  — `outstanding` in flight, further local edits composed into `buffer`
export class OTClient {
  constructor(revision = 0) {
    this.setRevision(revision);
  }

  // Resets to a fresh synchronized state at the given revision — call this
  // whenever a full resync happens (initial code:sync, forced resync, reconnect).
  setRevision(revision) {
    this.revision = revision;
    this.state = 'synchronized';
    this.outstanding = null;
    this.buffer = null;
  }

  // Call when the local user makes an edit. Returns { send } — an operation
  // to emit as code:op right now, or null if it must wait for the outstanding
  // operation to be acknowledged first.
  applyClient(operation) {
    if (this.state === 'synchronized') {
      this.outstanding = operation;
      this.state = 'awaitingConfirm';
      return { send: operation };
    }
    if (this.state === 'awaitingConfirm') {
      this.buffer = operation;
      this.state = 'awaitingWithBuffer';
      return { send: null };
    }
    // awaitingWithBuffer
    this.buffer = this.buffer.compose(operation);
    return { send: null };
  }

  // Call when a code:ack arrives for the outstanding operation. Returns
  // { send } — the buffered operation to emit next, or null if none.
  serverAck() {
    if (this.state === 'awaitingConfirm') {
      this.revision++;
      this.outstanding = null;
      this.state = 'synchronized';
      return { send: null };
    }
    if (this.state === 'awaitingWithBuffer') {
      this.revision++;
      const toSend = this.buffer;
      this.outstanding = toSend;
      this.buffer = null;
      this.state = 'awaitingConfirm';
      return { send: toSend };
    }
    throw new Error('serverAck called with no outstanding operation');
  }

  // Call when a code:op arrives from another client (already transformed by
  // the server against server-side history). Transforms it against any of
  // our own in-flight operations and returns the operation to actually apply
  // to the local document/editor.
  applyServer(operation) {
    this.revision++;
    if (this.state === 'synchronized') {
      return operation;
    }
    if (this.state === 'awaitingConfirm') {
      const [outstandingPrime, opPrime] = TextOperation.transform(this.outstanding, operation);
      this.outstanding = outstandingPrime;
      return opPrime;
    }
    // awaitingWithBuffer
    const [outstandingPrime, op1Prime] = TextOperation.transform(this.outstanding, operation);
    const [bufferPrime, op2Prime] = TextOperation.transform(this.buffer, op1Prime);
    this.outstanding = outstandingPrime;
    this.buffer = bufferPrime;
    return op2Prime;
  }
}
