import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { useSocket } from '../hooks/useSocket.js';
import { getRoom } from '../api/rooms';
import MonacoEditor, { DEFAULT_CODE } from '../components/editor/MonacoEditor';
import PresenceList from '../components/presence/PresenceList';
import { TextOperation } from '../ot/TextOperation';
import { OTClient } from '../ot/OTClient';

const CURSOR_DEBOUNCE_MS = 50;
// If no code:sync arrives this long after joining, we assume the room is
// brand new (empty on the server) and seed it with the welcome starter code.
const FRESH_ROOM_SEED_DELAY_MS = 400;

// Builds a TextOperation from Monaco's onDidChangeModelContent event,
// against `oldContent` (the document text as it was immediately before
// this change — Monaco's rangeOffset/rangeLength are relative to that).
function operationFromMonacoEvent(oldContent, changes) {
  const sorted = [...changes].sort((a, b) => a.rangeOffset - b.rangeOffset);
  const op = new TextOperation();
  let cursor = 0;
  for (const change of sorted) {
    const gap = change.rangeOffset - cursor;
    if (gap > 0) op.retain(gap);
    if (change.rangeLength > 0) op.delete(change.rangeLength);
    if (change.text) op.insert(change.text);
    cursor = change.rangeOffset + change.rangeLength;
  }
  const remaining = oldContent.length - cursor;
  if (remaining > 0) op.retain(remaining);
  return op;
}

// Translates a TextOperation into Monaco edit operations (computed against
// the model's current positions, i.e. before any of these edits are applied)
// and executes them as a single atomic batch.
function applyOperationToModel(editor, operation) {
  const model = editor.getModel();
  if (!model) return;
  let offset = 0;
  const edits = [];
  for (const component of operation.ops) {
    if (typeof component === 'number' && component > 0) {
      offset += component;
    } else if (typeof component === 'string') {
      const pos = model.getPositionAt(offset);
      edits.push({
        range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
        text: component,
        forceMoveMarkers: true,
      });
    } else if (typeof component === 'number' && component < 0) {
      const n = -component;
      const start = model.getPositionAt(offset);
      const end = model.getPositionAt(offset + n);
      edits.push({
        range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
        text: '',
        forceMoveMarkers: true,
      });
      offset += n;
    }
  }
  if (edits.length > 0) editor.executeEdits('remote-ot', edits);
}

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { socketRef, connected } = useSocket();

  const [room, setRoom] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [presenceUsers, setPresenceUsers] = useState([]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [language, setLanguage] = useState('javascript');
  // Map<userId, { username, position: { lineNumber, column } }>
  const [remoteCursors, setRemoteCursors] = useState(new Map());

  const editorRef = useRef(null);
  const isRemote = useRef(false);
  const cursorTimer = useRef(null);
  // Mirrors the editor's true current content (including unconfirmed local
  // edits) — used purely to compute correct baseLengths for outgoing ops.
  const docRef = useRef('');
  const otClientRef = useRef(new OTClient(0));
  const syncedRef = useRef(false);
  const seedTimer = useRef(null);
  // Monaco's core bundle loads asynchronously and can easily take longer
  // than the seed delay, so seeding/syncing must be gated on actual mount
  // readiness rather than a blind timeout from when the socket connected.
  const editorReadyRef = useRef(false);
  const roomJoinedRef = useRef(false);

  // Pushes whatever we currently know the document to be (docRef.current)
  // into the editor without generating an outgoing operation. Safe to call
  // any time — no-ops if the editor isn't mounted yet.
  const pushCurrentContentToEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    isRemote.current = true;
    editor.setValue(docRef.current);
    isRemote.current = false;
  }, []);

  const scheduleSeedIfReady = useCallback(() => {
    if (!editorReadyRef.current || !roomJoinedRef.current || syncedRef.current) return;
    clearTimeout(seedTimer.current);
    seedTimer.current = setTimeout(() => {
      if (syncedRef.current) return;
      const editor = editorRef.current;
      if (!editor) return;
      syncedRef.current = true; // treat the seed itself as "settled" so a late sync doesn't also fire
      editor.setValue(DEFAULT_CODE); // flows through as a normal local edit -> first code:op
    }, FRESH_ROOM_SEED_DELAY_MS);
  }, []);

  const handleEditorReady = useCallback(() => {
    editorReadyRef.current = true;
    if (syncedRef.current) {
      // A code:sync (or seed) already landed while Monaco was still loading.
      pushCurrentContentToEditor();
    } else {
      scheduleSeedIfReady();
    }
  }, [pushCurrentContentToEditor, scheduleSeedIfReady]);

  const copyCode = useCallback(() => {
    if (!room?.joinCode) return;
    navigator.clipboard.writeText(room.joinCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }, [room]);

  // Fetch room metadata (auto-joins if not a member)
  useEffect(() => {
    getRoom(roomId)
      .then((res) => setRoom(res.data.room))
      .catch((err) => {
        const status = err.response?.status;
        setLoadError(status === 404 ? 'Room not found.' : 'Failed to load room.');
      });
  }, [roomId]);

  // Socket: presence + OT editor sync + cursors
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;

    // Fresh room/reconnect: reset local OT state and clear the editor (if
    // mounted) until either a code:sync arrives (room already has content)
    // or the seed timer fires (room is genuinely new).
    docRef.current = '';
    otClientRef.current.setRevision(0);
    syncedRef.current = false;
    roomJoinedRef.current = false;
    clearTimeout(seedTimer.current);
    pushCurrentContentToEditor();

    socket.emit('room:join', roomId);
    roomJoinedRef.current = true;
    scheduleSeedIfReady();

    socket.on('presence:update', (data) => {
      if (data.roomId === roomId) setPresenceUsers(data.users);
    });

    socket.on('code:sync', (data) => {
      if (data.roomId !== roomId) return;
      clearTimeout(seedTimer.current);
      syncedRef.current = true;
      if (data.language) setLanguage(data.language);
      docRef.current = data.content;
      otClientRef.current.setRevision(data.revision ?? 0);
      pushCurrentContentToEditor();
    });

    // Legacy path — kept only for language broadcasts (content sync is now
    // handled entirely by code:op/code:sync above).
    socket.on('code:change', (data) => {
      if (data.roomId !== roomId) return;
      if (data.language) setLanguage(data.language);
    });

    socket.on('code:op', (data) => {
      if (data.roomId !== roomId) return;
      const editor = editorRef.current;
      if (!editor) return;
      const remoteOp = TextOperation.fromJSON(data.operation);
      const toApply = otClientRef.current.applyServer(remoteOp);
      docRef.current = toApply.apply(docRef.current);
      isRemote.current = true;
      applyOperationToModel(editor, toApply);
      isRemote.current = false;
    });

    socket.on('code:ack', (data) => {
      if (data.roomId !== roomId) return;
      const { send } = otClientRef.current.serverAck();
      if (send && socket && connected) {
        socket.emit('code:op', { roomId, revision: otClientRef.current.revision, operation: send.toJSON() });
      }
    });

    socket.on('cursor:move', (data) => {
      if (data.roomId !== roomId) return;
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.set(data.userId, { username: data.username, position: data.position });
        return next;
      });
    });

    socket.on('cursor:leave', (data) => {
      if (data.roomId !== roomId) return;
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.delete(data.userId);
        return next;
      });
    });

    return () => {
      clearTimeout(seedTimer.current);
      socket.off('presence:update');
      socket.off('code:sync');
      socket.off('code:change');
      socket.off('code:op');
      socket.off('code:ack');
      socket.off('cursor:move');
      socket.off('cursor:leave');
    };
  }, [socketRef, connected, roomId, pushCurrentContentToEditor, scheduleSeedIfReady]);

  const handleLocalChange = useCallback(
    (event) => {
      if (isRemote.current) return;
      const operation = operationFromMonacoEvent(docRef.current, event.changes);
      if (operation.isNoop()) return;
      docRef.current = operation.apply(docRef.current);

      const { send } = otClientRef.current.applyClient(operation);
      if (send) {
        const socket = socketRef.current;
        if (socket && connected) {
          socket.emit('code:op', { roomId, revision: otClientRef.current.revision, operation: send.toJSON() });
        }
      }
    },
    [socketRef, connected, roomId],
  );

  const handleLanguageChange = useCallback(
    (lang) => {
      setLanguage(lang);
      const socket = socketRef.current;
      if (socket && connected) {
        socket.emit('code:change', {
          roomId,
          content: editorRef.current?.getValue() ?? DEFAULT_CODE,
          language: lang,
        });
      }
    },
    [socketRef, connected, roomId],
  );

  const handleCursorChange = useCallback(
    (position) => {
      clearTimeout(cursorTimer.current);
      cursorTimer.current = setTimeout(() => {
        const socket = socketRef.current;
        if (socket && connected) {
          socket.emit('cursor:move', { roomId, position });
        }
      }, CURSOR_DEBOUNCE_MS);
    },
    [socketRef, connected, roomId],
  );

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <p className="text-gray-400 mb-4">{loadError}</p>
          <button onClick={() => navigate('/')} className="text-indigo-400 hover:underline">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Navbar */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← Rooms
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-white font-medium">{room?.name ?? '…'}</span>
          {room?.joinCode && (
            <button
              onClick={copyCode}
              title="Click to copy join code"
              className="ml-2 font-mono text-xs tracking-widest bg-gray-800 hover:bg-gray-700 border border-gray-700 text-indigo-300 px-2 py-1 rounded transition-colors"
            >
              {codeCopied ? 'Copied!' : room.joinCode}
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`flex items-center gap-1.5 text-xs ${connected ? 'text-emerald-400' : 'text-gray-500'}`}
          >
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-gray-600'}`} />
            {connected ? 'Connected' : 'Connecting…'}
          </span>
          <span className="text-sm text-gray-400 font-medium">{user?.username}</span>
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            language={language}
            onLanguageChange={handleLanguageChange}
            onLocalChange={handleLocalChange}
            onCursorChange={handleCursorChange}
            onEditorReady={handleEditorReady}
            remoteCursors={remoteCursors}
            editorRef={editorRef}
          />
        </div>

        {/* Sidebar — presence */}
        <aside className="w-52 shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              In this room
            </h2>
          </div>
          <PresenceList users={presenceUsers} />
        </aside>
      </div>
    </div>
  );
}
