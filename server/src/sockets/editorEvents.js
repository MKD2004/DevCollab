const TextOperation = require('../ot/TextOperation');
const OTDocument = require('../ot/OTDocument');

// In-memory editor state: roomId -> { content, language } (legacy last-write-wins)
const roomEditorState = new Map();

// In-memory OT documents: roomId -> OTDocument
const roomOTDocs = new Map();

function getOrCreateOTDoc(roomId) {
  let doc = roomOTDocs.get(roomId);
  if (!doc) {
    const legacyState = roomEditorState.get(roomId);
    doc = new OTDocument(legacyState?.content ?? '', legacyState?.language ?? 'javascript');
    roomOTDocs.set(roomId, doc);
  }
  return doc;
}

// Called by roomAuth once a `room:join` has been authorized. Pushes the
// current document (if any) to the joining socket.
function handleBranchJoin(io, socket, roomId) {
  const otDoc = roomOTDocs.get(roomId);
  if (otDoc) {
    socket.emit('code:sync', {
      roomId,
      content: otDoc.content,
      language: otDoc.language,
      revision: otDoc.revision,
    });
    return;
  }
  const state = roomEditorState.get(roomId);
  if (state) {
    socket.emit('code:sync', { roomId, content: state.content, language: state.language });
  }
}

function registerEditorEvents(io, socket) {
  socket.on('code:change', ({ roomId, content, language }) => {
    if (typeof roomId !== 'string' || typeof content !== 'string') return;
    if (!socket.data.authorizedBranches?.has(roomId)) return;
    roomEditorState.set(roomId, { content, language: language || 'javascript' });
    socket.to(roomId).emit('code:change', { roomId, content, language });
  });

  // OT-based concurrent editing: client submits an operation against the
  // revision it last saw; server transforms it forward against any
  // operations it missed, applies it, and broadcasts the transformed op.
  socket.on('code:op', ({ roomId, revision, operation, language }) => {
    if (typeof roomId !== 'string' || typeof revision !== 'number' || !Array.isArray(operation)) return;
    if (!socket.data.authorizedBranches?.has(roomId)) return;

    const otDoc = getOrCreateOTDoc(roomId);
    if (language) otDoc.language = language;

    let result;
    try {
      const parsedOp = TextOperation.fromJSON(operation);
      result = otDoc.applyClientOperation(revision, parsedOp);
    } catch {
      // Client's revision/operation is invalid or unrecoverable — force a full resync.
      socket.emit('code:sync', {
        roomId,
        content: otDoc.content,
        language: otDoc.language,
        revision: otDoc.revision,
      });
      return;
    }

    socket.emit('code:ack', { roomId, revision: result.revision });
    socket.to(roomId).emit('code:op', {
      roomId,
      operation: result.operation.toJSON(),
      revision: result.revision,
      userId: socket.data.user.id,
    });
  });

  socket.on('cursor:move', ({ roomId, position }) => {
    if (typeof roomId !== 'string' || !position) return;
    if (!socket.data.authorizedBranches?.has(roomId)) return;
    socket.to(roomId).emit('cursor:move', {
      roomId,
      userId: socket.data.user.id,
      username: socket.data.user.username,
      position,
    });
  });

  socket.on('disconnect', () => {
    if (!socket.data.rooms) return;
    for (const roomId of socket.data.rooms) {
      socket.to(roomId).emit('cursor:leave', {
        roomId,
        userId: socket.data.user.id,
      });
    }
  });
}

// Returns the current { content, language } for a room/branch id, or null if
// nothing has been edited yet. Used by branch creation to fork content.
function getOTDocState(roomId) {
  const doc = roomOTDocs.get(roomId);
  if (doc) return { content: doc.content, language: doc.language };
  const legacyState = roomEditorState.get(roomId);
  if (legacyState) return { content: legacyState.content, language: legacyState.language };
  return null;
}

// Seeds a fresh room/branch id with initial content, e.g. when forking a
// branch. No-ops if a document already exists for that id.
function seedOTDocState(roomId, content, language) {
  if (roomOTDocs.has(roomId)) return;
  roomOTDocs.set(roomId, new OTDocument(content, language));
}

module.exports = { registerEditorEvents, getOTDocState, seedOTDocState, handleBranchJoin };
