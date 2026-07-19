import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { useSocket } from '../hooks/useSocket.jsx';
import { getRoom, previewRoom, promoteAdmin, demoteAdmin, leaveRoom } from '../api/rooms';
import { listBranches, createBranch, renameBranch } from '../api/branches';
import { getMessages } from '../api/messages';
import { requestToJoin, listJoinRequests, acceptJoinRequest, declineJoinRequest } from '../api/joinRequests';
import MonacoEditor, { DEFAULT_CODE } from '../components/editor/MonacoEditor';
import BranchTabs from '../components/editor/BranchTabs';
import OutputPanel from '../components/editor/OutputPanel';
import PresenceList from '../components/presence/PresenceList';
import ChatPanel from '../components/chat/ChatPanel';
import JoinRequestsPanel from '../components/room/JoinRequestsPanel';
import RequestToJoinScreen from '../components/room/RequestToJoinScreen';
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
  // Non-null while the requester isn't (yet) a member: { roomName, status }
  // where status is 'idle' | 'sending' | 'pending' | 'declined'.
  const [joinAccess, setJoinAccess] = useState(null);
  const [joinRequests, setJoinRequests] = useState([]); // owner-only, pending requests
  const [branches, setBranches] = useState([]);
  const [currentBranchId, setCurrentBranchId] = useState(null);
  const [presenceUsers, setPresenceUsers] = useState([]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [language, setLanguage] = useState('javascript');
  // Map<userId, { username, position: { lineNumber, column } }>
  const [remoteCursors, setRemoteCursors] = useState(new Map());
  const [runState, setRunState] = useState('idle'); // 'idle' | 'running'
  const [runOutput, setRunOutput] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sidebarTab, setSidebarTab] = useState('people'); // 'people' | 'chat' | 'requests'
  const [leavingRoom, setLeavingRoom] = useState(false); // toggles the leave-room confirmation panel
  const [transferTo, setTransferTo] = useState(''); // selected admin userId, owner-leave flow only
  const [leaveError, setLeaveError] = useState('');

  const currentUserId = String(user?._id ?? user?.id ?? '');
  const isOwner = Boolean(room && currentUserId && String(room.ownerId?._id ?? room.ownerId) === currentUserId);
  const isAdmin = Boolean(
    room && currentUserId && (room.admins ?? []).some((a) => String(a._id ?? a) === currentUserId),
  );

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

  // Fetches room metadata + branch list + chat history. Requester must
  // already be a member (join via a join code, or have a join request
  // accepted) — a 403 here shows the request-to-join screen instead of a
  // dead end. Re-run manually once a pending request gets accepted (see
  // the join-request:resolved socket listener below), since the initial
  // 403 skipped branches/messages too.
  const loadRoomData = useCallback(() => {
    getRoom(roomId)
      .then((res) => {
        setRoom(res.data.room);
        setJoinAccess(null);
      })
      .catch((err) => {
        const status = err.response?.status;
        if (status === 404) {
          setLoadError('Room not found.');
        } else if (status === 403) {
          previewRoom(roomId)
            .then((res) => setJoinAccess((prev) => ({ roomName: res.data.room.name, status: prev?.status ?? 'idle' })))
            .catch(() => setLoadError('Room not found.'));
        } else {
          setLoadError('Failed to load room.');
        }
      });

    listBranches(roomId)
      .then((res) => {
        const list = res.data.branches;
        setBranches(list);
        const defaultBranch = list.find((b) => b.isDefault) ?? list[0];
        if (defaultBranch) setCurrentBranchId(defaultBranch._id);
      })
      .catch(() => {
        // Best-effort — a non-member's failed branches fetch is expected
        // and handled by the join-access screen above, not a fatal error.
      });

    getMessages(roomId)
      .then((res) => setMessages(res.data.messages))
      .catch(() => {
        // Best-effort — chat simply starts empty if history fails to load.
      });
  }, [roomId]);

  useEffect(() => {
    loadRoomData();
  }, [loadRoomData]);

  // Owner or admin: load pending join requests once the room itself has loaded.
  useEffect(() => {
    if (!isOwner && !isAdmin) return;
    listJoinRequests(roomId)
      .then((res) => setJoinRequests(res.data.requests))
      .catch(() => {});
  }, [isOwner, isAdmin, roomId]);

  // Account-level notifications — not scoped to the current branch, and
  // work even before the requester is a room member (the server reaches
  // every authenticated connection via a personal `user:<id>` socket room,
  // independent of the room/branch membership gate used everywhere else).
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;

    const handleCreated = (data) => {
      if (data.roomId !== roomId) return;
      setJoinRequests((prev) => [...prev, { _id: data.requestId, username: data.username }]);
    };
    const handleResolved = (data) => {
      if (data.roomId !== roomId) return;
      if (data.status === 'accepted') {
        loadRoomData();
      } else {
        setJoinAccess((prev) => (prev ? { ...prev, status: 'declined' } : prev));
      }
    };

    socket.on('join-request:created', handleCreated);
    socket.on('join-request:resolved', handleResolved);
    return () => {
      socket.off('join-request:created', handleCreated);
      socket.off('join-request:resolved', handleResolved);
    };
  }, [socketRef, connected, roomId, loadRoomData]);

  const handleRequestToJoin = useCallback(async () => {
    setJoinAccess((prev) => prev && { ...prev, status: 'sending' });
    try {
      await requestToJoin(roomId);
      setJoinAccess((prev) => prev && { ...prev, status: 'pending' });
    } catch {
      setJoinAccess((prev) => prev && { ...prev, status: 'idle' });
    }
  }, [roomId]);

  const handleAcceptRequest = useCallback(
    async (requestId) => {
      try {
        await acceptJoinRequest(roomId, requestId);
        setJoinRequests((prev) => prev.filter((r) => r._id !== requestId));
      } catch {
        // Best-effort — request simply stays in the pending list to retry.
      }
    },
    [roomId],
  );

  const handleDeclineRequest = useCallback(
    async (requestId) => {
      try {
        await declineJoinRequest(roomId, requestId);
        setJoinRequests((prev) => prev.filter((r) => r._id !== requestId));
      } catch {
        // Best-effort — request simply stays in the pending list to retry.
      }
    },
    [roomId],
  );

  const handlePromote = useCallback(
    async (userId) => {
      try {
        await promoteAdmin(roomId, userId);
        loadRoomData(); // re-fetch so the new admin's populated username shows immediately
      } catch {
        // Best-effort — member simply stays a plain member.
      }
    },
    [roomId, loadRoomData],
  );

  const handleDemote = useCallback(
    async (userId) => {
      try {
        await demoteAdmin(roomId, userId);
        setRoom((prev) =>
          prev ? { ...prev, admins: prev.admins.filter((a) => String(a._id ?? a) !== userId) } : prev,
        );
      } catch {
        // Best-effort — admin simply stays an admin.
      }
    },
    [roomId],
  );

  const handleLeaveRoom = useCallback(async () => {
    setLeaveError('');
    if (isOwner && !transferTo) {
      setLeaveError('Choose who becomes the new owner.');
      return;
    }
    try {
      await leaveRoom(roomId, isOwner ? transferTo : undefined);
      navigate('/dashboard');
    } catch (err) {
      setLeaveError(err.response?.data?.message || 'Failed to leave the room');
    }
  }, [roomId, isOwner, transferTo, navigate]);

  const handleCreateBranch = useCallback(
    async (name) => {
      try {
        const res = await createBranch(roomId, { name, fromBranchId: currentBranchId });
        const newBranch = res.data.branch;
        setBranches((prev) => [...prev, newBranch]);
        setCurrentBranchId(newBranch._id);
      } catch {
        // Best-effort — branch list simply won't gain the new entry.
      }
    },
    [roomId, currentBranchId],
  );

  const handleRenameBranch = useCallback(
    async (branchId, name) => {
      try {
        const res = await renameBranch(roomId, branchId, name);
        const updated = res.data.branch;
        setBranches((prev) => prev.map((b) => (b._id === branchId ? updated : b)));
      } catch {
        // Best-effort — e.g. a name collision just leaves the old name in place.
      }
    },
    [roomId],
  );

  // Socket: presence + OT editor sync + cursors, scoped to the current branch.
  // Content identity is per-branch, so the socket "room" joined here is the
  // branch id, not the DevCollab room id — switching branches re-runs this
  // effect (cleanup leaves the old branch, then we join the new one).
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected || !currentBranchId) return;
    const branchId = currentBranchId;

    // Fresh branch/reconnect: reset local OT state and clear the editor (if
    // mounted) until either a code:sync arrives (branch already has content)
    // or the seed timer fires (branch is genuinely new).
    docRef.current = '';
    otClientRef.current.setRevision(0);
    syncedRef.current = false;
    roomJoinedRef.current = false;
    clearTimeout(seedTimer.current);
    pushCurrentContentToEditor();
    setRunState('idle');
    setRunOutput(null);

    socket.emit('room:join', branchId);
    roomJoinedRef.current = true;
    scheduleSeedIfReady();

    socket.on('presence:update', (data) => {
      if (data.roomId === branchId) setPresenceUsers(data.users);
    });

    socket.on('code:sync', (data) => {
      if (data.roomId !== branchId) return;
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
      if (data.roomId !== branchId) return;
      if (data.language) setLanguage(data.language);
    });

    socket.on('code:op', (data) => {
      if (data.roomId !== branchId) return;
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
      if (data.roomId !== branchId) return;
      const { send } = otClientRef.current.serverAck();
      if (send && socket && connected) {
        socket.emit('code:op', { roomId: branchId, revision: otClientRef.current.revision, operation: send.toJSON() });
      }
    });

    socket.on('cursor:move', (data) => {
      if (data.roomId !== branchId) return;
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.set(data.userId, { username: data.username, position: data.position });
        return next;
      });
    });

    socket.on('cursor:leave', (data) => {
      if (data.roomId !== branchId) return;
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.delete(data.userId);
        return next;
      });
    });

    socket.on('code:running', (data) => {
      if (data.roomId !== branchId) return;
      setRunState('running');
      setRunOutput({ runningUser: data.username });
    });

    socket.on('code:result', (data) => {
      if (data.roomId !== branchId) return;
      setRunState('idle');
      setRunOutput({
        stdout: data.stdout,
        stderr: data.stderr,
        exitCode: data.exitCode,
        compileOutput: data.compileOutput,
        ranBy: data.ranBy,
      });
    });

    socket.on('code:error', (data) => {
      if (data.roomId !== branchId) return;
      setRunState('idle');
      setRunOutput({ error: data.message });
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
      socket.off('code:running');
      socket.off('code:result');
      socket.off('code:error');
      socket.emit('room:leave', branchId);
      setRemoteCursors(new Map());
    };
  }, [socketRef, connected, currentBranchId, pushCurrentContentToEditor, scheduleSeedIfReady]);

  // Socket: chat, scoped to the DevCollab room itself (not the branch) — it
  // stays joined across branch switches, unlike the OT/presence effect above.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;

    socket.emit('chat:join', roomId);

    socket.on('chat:message', (msg) => {
      if (msg.roomId !== roomId) return;
      setMessages((prev) => [...prev, msg]);
    });

    // Someone's membership/role changed (joined, got promoted/demoted,
    // ownership transferred) — our local room.members/admins is stale.
    socket.on('room:updated', (data) => {
      if (data.roomId !== roomId) return;
      loadRoomData();
    });

    return () => {
      socket.off('chat:message');
      socket.off('room:updated');
      socket.emit('chat:leave', roomId);
    };
  }, [socketRef, connected, roomId, loadRoomData]);

  const handleSendMessage = useCallback(
    (text) => {
      const socket = socketRef.current;
      if (socket && connected) {
        socket.emit('chat:message', { roomId, text });
      }
    },
    [socketRef, connected, roomId],
  );

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
          socket.emit('code:op', { roomId: currentBranchId, revision: otClientRef.current.revision, operation: send.toJSON() });
        }
      }
    },
    [socketRef, connected, currentBranchId],
  );

  const handleLanguageChange = useCallback(
    (lang) => {
      setLanguage(lang);
      const socket = socketRef.current;
      if (socket && connected) {
        socket.emit('code:change', {
          roomId: currentBranchId,
          content: editorRef.current?.getValue() ?? DEFAULT_CODE,
          language: lang,
        });
      }
    },
    [socketRef, connected, currentBranchId],
  );

  const handleRun = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !connected || !currentBranchId) return;
    socket.emit('code:run', {
      roomId: currentBranchId,
      code: docRef.current,
      language,
    });
  }, [socketRef, connected, currentBranchId, language]);

  const handleCursorChange = useCallback(
    (position) => {
      clearTimeout(cursorTimer.current);
      cursorTimer.current = setTimeout(() => {
        const socket = socketRef.current;
        if (socket && connected) {
          socket.emit('cursor:move', { roomId: currentBranchId, position });
        }
      }, CURSOR_DEBOUNCE_MS);
    },
    [socketRef, connected, currentBranchId],
  );

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{loadError}</p>
          <button onClick={() => navigate('/dashboard')} className="text-primary hover:underline">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (joinAccess) {
    return (
      <RequestToJoinScreen
        roomName={joinAccess.roomName}
        status={joinAccess.status}
        onRequest={handleRequestToJoin}
        onBack={() => navigate('/dashboard')}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="flex items-center justify-between px-6 py-3 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Rooms
          </button>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-foreground font-medium">{room?.name ?? '…'}</span>
          {room?.joinCode && (
            <button
              onClick={copyCode}
              title="Click to copy join code"
              className="ml-2 font-mono text-xs tracking-widest bg-secondary hover:bg-secondary/70 border border-border text-primary px-2 py-1 rounded transition-colors"
            >
              {codeCopied ? 'Copied!' : room.joinCode}
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`flex items-center gap-1.5 text-xs ${connected ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`} />
            {connected ? 'Connected' : 'Connecting…'}
          </span>
          <span className="text-sm text-muted-foreground font-medium">{user?.username}</span>
          <div className="relative">
            <button
              onClick={() => {
                setLeaveError('');
                setLeavingRoom((v) => !v);
              }}
              className="text-sm text-muted-foreground hover:text-foreground border border-border hover:border-foreground/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              Leave Room
            </button>
            {leavingRoom && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-lg card-shadow p-3 z-10">
                {isOwner ? (
                  (room?.admins ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Promote a member to admin first — there's no one to hand ownership to.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mb-2">Transfer ownership to:</p>
                      <select
                        value={transferTo}
                        onChange={(e) => setTransferTo(e.target.value)}
                        className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm text-foreground mb-2"
                      >
                        <option value="">Select an admin…</option>
                        {room.admins.map((a) => (
                          <option key={a._id} value={a._id}>
                            {a.username}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleLeaveRoom}
                        className="w-full text-sm bg-destructive hover:bg-destructive/90 text-white px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Transfer &amp; Leave
                      </button>
                    </>
                  )
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">Leave this room?</p>
                    <button
                      onClick={handleLeaveRoom}
                      className="w-full text-sm bg-destructive hover:bg-destructive/90 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Leave
                    </button>
                  </>
                )}
                {leaveError && <p className="text-xs text-destructive mt-2">{leaveError}</p>}
              </div>
            )}
          </div>
          <button
            onClick={logout}
            className="text-sm text-muted-foreground hover:text-foreground border border-border hover:border-foreground/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <MonacoEditor
              language={language}
              onLanguageChange={handleLanguageChange}
              onLocalChange={handleLocalChange}
              onCursorChange={handleCursorChange}
              onEditorReady={handleEditorReady}
              remoteCursors={remoteCursors}
              editorRef={editorRef}
              branchTabsSlot={
                <BranchTabs
                  branches={branches}
                  currentBranchId={currentBranchId}
                  onSwitch={setCurrentBranchId}
                  onCreate={handleCreateBranch}
                  onRename={handleRenameBranch}
                />
              }
              onRun={handleRun}
              isRunning={runState === 'running'}
            />
          </div>
          <OutputPanel state={runState} output={runOutput} />
        </div>

        {/* Sidebar — presence + chat */}
        <aside className="w-72 shrink-0 bg-card border-l border-border flex flex-col">
          <div className="flex border-b border-border shrink-0">
            <button
              onClick={() => setSidebarTab('people')}
              className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                sidebarTab === 'people'
                  ? 'text-foreground border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              People
            </button>
            <button
              onClick={() => setSidebarTab('chat')}
              className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                sidebarTab === 'chat'
                  ? 'text-foreground border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Chat
            </button>
            {(isOwner || isAdmin) && (
              <button
                onClick={() => setSidebarTab('requests')}
                className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  sidebarTab === 'requests'
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Requests{joinRequests.length > 0 && ` (${joinRequests.length})`}
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {sidebarTab === 'people' && (
              <PresenceList
                members={room?.members ?? []}
                ownerId={String(room?.ownerId?._id ?? room?.ownerId ?? '')}
                adminIds={new Set((room?.admins ?? []).map((a) => String(a._id ?? a)))}
                onlineUserIds={new Set(presenceUsers.map((u) => u.userId))}
                isOwner={isOwner}
                onPromote={handlePromote}
                onDemote={handleDemote}
              />
            )}
            {sidebarTab === 'chat' && (
              <ChatPanel messages={messages} currentUsername={user?.username} onSend={handleSendMessage} />
            )}
            {sidebarTab === 'requests' && (isOwner || isAdmin) && (
              <JoinRequestsPanel
                requests={joinRequests}
                onAccept={handleAcceptRequest}
                onDecline={handleDeclineRequest}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
