# DevCollab — Full Project Plan

Real-time collaborative code editor with Operational Transform and Git-style branching for isolated concurrent editing.

---

## 1. Tech Stack

```
Frontend
  React 18 + Vite
  Tailwind CSS
  @monaco-editor/react        — editor
  socket.io-client            — real-time transport
  axios                       — REST calls (auth, room/branch metadata)
  zustand or React Context    — client state (editor state, connected users, active branch)

Backend
  Node.js 20 + Express
  socket.io                   — real-time transport
  @socket.io/redis-adapter    — cross-server broadcast
  ioredis / redis             — pub/sub + OT state store
  mongoose                    — MongoDB ODM
  jsonwebtoken + bcryptjs     — auth

Data stores
  MongoDB Atlas (M0 free tier) — users, rooms, branches, persisted document snapshots
  Redis (Railway add-on / Upstash) — pub/sub across server instances, live OT sequence
                                       counters + in-flight document state per branch

External services
  Piston API — in-browser code execution, 50+ languages, no key needed

Deployment
  Frontend → Vercel
  Backend  → Railway (with Redis add-on)
  Docker   → Dockerfiles for both services (added in hardening phase)
```

---

## 2. Core Concepts

**Room** — a project/session container. Has a name, an owner, a list of members, and one or more branches. Analogous to a GitHub repo.

**Branch** — an isolated, independently-editable document within a room. Every branch has its own live OT document state and its own Socket.io channel, so users on different branches never conflict with each other — only users on the *same* branch go through OT against one another. Analogous to a git branch.

**Merge** — copying (or diffing/reconciling) one branch's content into another. V1 is a simple "overwrite target with source, with confirmation" merge; true diff-based merging with conflict markers is a stretch goal.

This structure means OT only has to solve conflicts *within* a branch, not across an entire room — which keeps the hard part of the project properly scoped.

---

## 3. Feature List

### Core (must-have for resume-ready V1)
- JWT authentication (register/login)
- Room creation with shareable link, room membership
- Branch creation within a room, forked from `main` or any existing branch
- Monaco Editor with live syntax highlighting
- Real-time sync via Socket.io, scoped per-branch
- Operational Transform: conflict-free simultaneous editing within a branch
- Live cursors with username labels, per-user color, scoped per-branch
- In-browser code execution via Piston API (JS, Python, C++, Java minimum)
- Branch switching UI (like a git branch dropdown)
- Simple merge: merge branch A into branch B with confirmation step

### Infrastructure
- Redis Pub/Sub via Socket.io adapter for horizontal scaling across server instances
- Redis as the source of truth for each branch's OT sequence counter and in-flight document state (not server memory) — this is what makes correctness independent of which server a user is connected to
- MongoDB persistence: rooms, branches, and periodic document snapshots so state survives server restarts and idle branches can be reloaded

### Polish
- Chat panel scoped per-branch (or per-room, your call — per-branch keeps discussion tied to the work happening there)
- Language selector, respected by both Monaco's syntax highlighting and the Piston execution call
- Light/dark theme toggle
- Execution output panel with stdin support
- Presence indicators (avatars/initials) per branch
- Room/branch history — rejoin a room and see the list of branches and their last-updated times

### Stretch (post-V1, only if time allows)
- True 3-way merge with visual conflict markers (closer to real git merge UX)
- Branch diff view — see what changed between two branches before merging
- Commit-style checkpoints within a branch (save named snapshots you can revert to)

---

## 4. Data Models (MongoDB)

```
User
  _id
  username
  email
  passwordHash
  createdAt

Room
  _id
  name
  ownerId          → User
  members: [UserId]
  createdAt

Branch
  _id
  roomId           → Room
  name             (e.g. "main", "feature-x")
  forkedFrom        → Branch (null for main)
  content          (last persisted snapshot — live state lives in Redis while active)
  language
  createdBy        → User
  createdAt
  updatedAt
```

Redis keys (conceptual, not literal schema):
```
branch:{branchId}:doc         → current live document state
branch:{branchId}:seq         → OT sequence counter
branch:{branchId}:presence    → connected users
```

---

## 5. Project Structure

```
devcollab/
├── client/
│   ├── src/
│   │   ├── api/
│   │   │   ├── auth.js
│   │   │   ├── rooms.js
│   │   │   └── branches.js
│   │   ├── components/
│   │   │   ├── editor/
│   │   │   │   ├── MonacoEditor.jsx
│   │   │   │   ├── CursorOverlay.jsx
│   │   │   │   └── LanguageSelector.jsx
│   │   │   ├── branches/
│   │   │   │   ├── BranchSwitcher.jsx
│   │   │   │   ├── CreateBranchModal.jsx
│   │   │   │   └── MergeBranchModal.jsx
│   │   │   ├── chat/
│   │   │   │   └── ChatPanel.jsx
│   │   │   ├── execution/
│   │   │   │   └── OutputPanel.jsx
│   │   │   ├── presence/
│   │   │   │   └── PresenceList.jsx
│   │   │   └── auth/
│   │   │       ├── LoginForm.jsx
│   │   │       └── RegisterForm.jsx
│   │   ├── hooks/
│   │   │   ├── useSocket.js
│   │   │   ├── useOT.js              (client-side op buffering/transform)
│   │   │   └── useAuth.js
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx         (list/create rooms)
│   │   │   ├── Room.jsx              (room shell, branch switcher)
│   │   │   └── Login.jsx
│   │   ├── store/
│   │   │   └── editorStore.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Room.js
│   │   │   └── Branch.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── rooms.routes.js
│   │   │   └── branches.routes.js
│   │   ├── sockets/
│   │   │   ├── index.js              (socket auth middleware, connection handler)
│   │   │   ├── editorEvents.js       (op broadcast/receive per branch)
│   │   │   ├── cursorEvents.js
│   │   │   ├── chatEvents.js
│   │   │   └── presenceEvents.js
│   │   ├── ot/
│   │   │   ├── transform.js          (the core transform function)
│   │   │   ├── transform.test.js
│   │   │   └── sequencer.js          (Redis-backed per-branch authority)
│   │   ├── redis/
│   │   │   ├── client.js
│   │   │   └── adapter.js            (Socket.io Redis adapter setup)
│   │   ├── execution/
│   │   │   └── piston.js
│   │   ├── middleware/
│   │   │   └── auth.middleware.js
│   │   ├── config/
│   │   │   └── db.js
│   │   └── app.js
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml        (local dev: mongo + redis + both services)
└── README.md
```

---

## 6. Build Sequence (high level — see the Claude Code prompt pack for session-by-session prompts)

1. **Week 1** — Auth, Monaco rendering, Socket.io rooms, deploy skeleton
2. **Week 2** — Last-write-wins sync, live cursors, Redis pub/sub, Piston execution → shippable V1
3. **Week 3** — Operational Transform (transform function → server authority → wired into Monaco)
4. **Week 4** — Chat, language selector, room persistence, presence polish
5. **Week 4.5 (new)** — Branching: fork branches, per-branch OT scoping, branch switcher UI, simple merge
6. **Week 5** — Scaling hardening, Docker, load testing, deployment
7. **Week 6** — README, architecture diagram, demo GIF, resume polish

I've added Week 4.5 as its own slot for branching rather than folding it into Week 4, since it changes your data model (room → branches, not room → single document) and touches both the OT sequencing layer and the Redis key structure. It's worth giving it a clean session rather than squeezing it in.

---

## 7. Resume Bullets (draft, refine once built)

```
DevCollab — Real-time Collaborative Code Editor
React · Node.js · Socket.io · Redis · MongoDB · Monaco Editor · OT

• Implemented Operational Transform for conflict-free simultaneous 
  editing — concurrent ops are transformed and sequenced by a 
  Redis-backed authority per branch, guaranteeing convergence across 
  horizontally scaled server instances.

• Designed a Git-inspired branching model allowing users to fork 
  isolated editing sessions from a shared starting point, reducing 
  edit contention and enabling simple merge-back into main.

• Built real-time infrastructure with Socket.io + Redis Pub/Sub 
  (live cursors, presence, chat) and integrated Monaco Editor with 
  in-browser code execution via the Piston API across 50+ languages.
```

---

Want me to add a Week 4.5 prompt pair (branch creation/switching + merge) to the Claude Code prompt file, positioned between Week 4 and Week 5?
