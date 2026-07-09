# DevCollab — Project Context

Live reference for every file in the repo, session rules, and current build state.
Update this file whenever files are added, removed, or significantly changed.

---

## Session Rules

| Rule | Detail |
|------|--------|
| **Git author** | Always `MKD2004 <mahith.k@gmail.com>` — never Claude in the author list |
| **Git identity setup** | Run `git config user.name "MKD2004"` and `git config user.email "mahith.k@gmail.com"` at repo level before any commit |
| **Verify before push** | Run `git log --format="%an <%ae>" -1` to confirm author before pushing |
| **One commit per logical change** | Never bundle unrelated changes into one commit |
| **Remote** | `origin` → `https://github.com/MKD2004/DevCollab.git`, default branch `main` |
| **Push command** | `git push origin HEAD:main` (local branch is `main`, tracks `origin/main`) |
| **No .env in commits** | `.env` is gitignored — never stage it. `.env.example` is committed instead |
| **Build in stages** | Only build what the current session scope defines — no jumping ahead |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 8, Tailwind CSS 3, @monaco-editor/react, axios, react-router-dom |
| Backend | Node.js 20 + Express, Mongoose, bcryptjs, jsonwebtoken, dotenv, cors |
| Database | MongoDB Atlas (M0 free tier) — standard connection string (non-SRV, due to DNS issue on dev machine) |
| Testing | Jest + Supertest + mongodb-memory-server (server), no client tests yet |
| Future | Socket.io, Redis, Piston API, Docker |

---

## Monorepo Structure

```
devcollab/
├── client/                  React + Vite frontend
├── server/                  Node + Express backend
├── .gitignore
├── context.md               ← this file
└── DevCollab_Project_Plan.md
```

---

## Build State

### Completed — Week 1 Day 1
- JWT auth (register, login, `/me` protected route)
- MongoDB User model with bcryptjs hashing
- Auth middleware
- Monaco Editor on authenticated Dashboard page
- 12/12 auth tests passing

### Not built yet
- Socket.io rooms and real-time sync
- Redis pub/sub
- Branching model (Room, Branch models)
- Live cursors, presence, chat
- Piston API code execution
- Docker / deployment

---

## Environment Variables

### server/.env (gitignored — never commit)
```
PORT=5000
MONGODB_URI=mongodb://devcollab-admin:<password>@ac-mfbhgje-shard-00-00.jjhttsi.mongodb.net:27017,...
            /devcollab?ssl=true&replicaSet=atlas-lekp9x-shard-0&authSource=admin&...
JWT_SECRET=<random string>
JWT_EXPIRES_IN=7d
```
> Uses standard (non-SRV) connection string — the dev machine's DNS resolver blocks SRV queries.

### client/.env (gitignored — never commit)
```
VITE_API_URL=http://localhost:5000
```

---

## File Reference

### Root

| File | Purpose |
|------|---------|
| `.gitignore` | Ignores node_modules, .env, dist, OS files |
| `DevCollab_Project_Plan.md` | Full 6-week roadmap, data models, resume bullets |
| `context.md` | This file — live project context |

---

### server/

| File | Purpose |
|------|---------|
| `package.json` | Express, mongoose, bcryptjs, jsonwebtoken, cors, dotenv as deps; Jest, Supertest, mongodb-memory-server as devDeps; `npm test` runs Jest |
| `.env.example` | Template for required env vars — copy to `.env` and fill in |
| `src/app.js` | Express entry point — mounts CORS, JSON body parser, `/api/auth` routes, `/api/health`; skips DB connect when `NODE_ENV=test` |
| `src/config/db.js` | Calls `mongoose.connect(process.env.MONGODB_URI)` — imported by app.js on startup |
| `src/models/User.js` | Mongoose schema: `username`, `email`, `passwordHash`, `createdAt/updatedAt`. Static `hashPassword()` uses bcrypt rounds=12. Instance method `comparePassword()` for login |
| `src/routes/auth.routes.js` | `POST /api/auth/register` — validates fields, rejects duplicates, hashes password, returns JWT. `POST /api/auth/login` — verifies credentials, returns JWT. `GET /api/auth/me` — protected, returns current user without passwordHash |
| `src/middleware/auth.middleware.js` | Reads `Authorization: Bearer <token>`, verifies JWT, attaches `req.user = {id, username, email}`. Returns 401 for missing/invalid token |
| `tests/auth.test.js` | 12 tests across register, login, and /me using in-memory MongoDB. Covers happy paths, duplicate rejection, wrong password, missing/invalid/malformed JWT |

---

### client/

| File | Purpose |
|------|---------|
| `package.json` | React, react-dom, react-router-dom, @monaco-editor/react, axios as deps; Tailwind, PostCSS, autoprefixer, Vite as devDeps |
| `.env.example` | `VITE_API_URL=http://localhost:5000` |
| `vite.config.js` | Default Vite config (React plugin) |
| `tailwind.config.js` | Content glob covers `./index.html` and `./src/**/*.{js,jsx,ts,tsx}` |
| `postcss.config.js` | Tailwind + autoprefixer |
| `index.html` | Vite entry HTML — mounts `#root` |
| `src/main.jsx` | Renders `<App />` into `#root` with StrictMode |
| `src/index.css` | Tailwind directives (`@tailwind base/components/utilities`), dark body background |
| `src/App.jsx` | Router root — wraps everything in `<AuthProvider>`. Routes: `/login` (public-only), `/` (protected), `*` → `/`. `ProtectedRoute` redirects unauthenticated users to `/login`. `PublicRoute` redirects authenticated users to `/` |
| `src/api/auth.js` | Axios instance with `baseURL = VITE_API_URL`. Interceptor attaches `Authorization: Bearer <token>` from localStorage. Exports `register()`, `login()`, `getMe()` |
| `src/hooks/useAuth.jsx` | `AuthProvider` context — on mount, reads token from localStorage and calls `getMe()` to rehydrate user. Exposes `{ user, loading, login(token, user), logout() }`. **Note: must be `.jsx` — Vite 8 OXC only processes JSX in `.jsx` files** |
| `src/components/auth/LoginForm.jsx` | Toggle between Sign In / Register tabs. Calls `loginApi` or `registerApi`, stores token via `useAuth().login()`. Shows inline error messages from API |
| `src/components/editor/MonacoEditor.jsx` | Monaco Editor with `vs-dark` theme. Language selector dropdown (JS, TS, Python, C++, Java, Go, Rust). Default JS starter code. Options: minimap, word wrap, smooth scrolling, line numbers |
| `src/pages/Dashboard.jsx` | Authenticated shell — navbar with username + sign out button, full-height Monaco editor below |

---

## Known Issues / Gotchas

| Issue | Resolution |
|-------|-----------|
| Vite 8 OXC won't parse JSX in `.js` files | Any file returning JSX must use `.jsx` extension |
| `mongodb+srv://` SRV DNS fails on dev machine | Use standard `mongodb://` connection string with explicit shard hosts on port 27017 |
| Local branch named `master`, remote is `main` | Fixed — local branch renamed to `main`, tracking `origin/main`. Use `git push origin HEAD:main` if push fails |

---

## Commit History

| Hash | Message |
|------|---------|
| `4c21eca` | chore: remove stale useAuth.js after rename to useAuth.jsx |
| `1eae42a` | fix: rename useAuth.js to useAuth.jsx for Vite OXC JSX parsing |
| `fdbf207` | Week 1 Day 1: auth + Monaco editor scaffold |

---

## Running Locally

```bash
# Terminal 1 — backend
cd server
node src/app.js
# → MongoDB connected, Server running on port 5000

# Terminal 2 — frontend
cd client
npm run dev
# → http://localhost:5173

# Run tests
cd server
npm test
```
