# DevCollab

A real-time collaborative code editor with Operational Transform and Git-inspired branching, built for concurrent editing without conflicts.

## Tech Stack

**Frontend** — React 18, Vite, Tailwind CSS, Monaco Editor, Socket.io-client, Axios  
**Backend** — Node.js 20, Express, Socket.io, MongoDB (Mongoose), Redis  
**Auth** — JWT + bcryptjs  
**Execution** — Piston API (in-browser, 50+ languages)  
**Deployment** — Vercel (client), Railway (server + Redis)

## Features

- JWT authentication (register / login)
- Monaco Editor with syntax highlighting and language selector
- Real-time collaborative editing via Socket.io (Operational Transform)
- Git-inspired branching — fork isolated editing sessions, merge back to main
- Live cursors with per-user colors and username labels
- In-browser code execution via Piston API
- Horizontal scaling with Redis Pub/Sub across server instances

## Project Structure

```
devcollab/
├── client/          # React + Vite frontend
│   └── src/
│       ├── api/         # Axios API calls
│       ├── components/  # Editor, auth, branch UI, chat, execution
│       ├── hooks/       # useAuth, useSocket, useOT
│       ├── pages/       # Login, Dashboard, Room
│       └── store/       # Zustand / Context state
└── server/          # Node + Express backend
    └── src/
        ├── config/      # MongoDB connection
        ├── middleware/  # JWT auth middleware
        ├── models/      # User, Room, Branch schemas
        ├── routes/      # Auth, rooms, branches REST endpoints
        ├── sockets/     # Socket.io event handlers
        ├── ot/          # Operational Transform core
        └── redis/       # Redis client + Socket.io adapter
```

## Getting Started

### Prerequisites
- Node.js 20+
- MongoDB Atlas account
- Redis instance (Railway / Upstash)

### Setup

```bash
# Clone the repo
git clone https://github.com/MKD2004/DevCollab.git
cd DevCollab

# Server
cd server
cp .env.example .env      # fill in MONGODB_URI and JWT_SECRET
npm install
npm run dev               # runs on http://localhost:5000

# Client (new terminal)
cd client
cp .env.example .env      # set VITE_API_URL=http://localhost:5000
npm install
npm run dev               # runs on http://localhost:5173
```

### Running Tests

```bash
cd server
npm test     # Jest + Supertest + mongodb-memory-server (no real DB needed)
```

## Build Progress

- [x] Week 1 — Auth, Monaco editor scaffold
- [ ] Week 2 — Socket.io rooms, last-write-wins sync, live cursors, Piston execution
- [ ] Week 3 — Operational Transform
- [ ] Week 4 — Chat, language selector, presence, room persistence
- [ ] Week 4.5 — Branching: fork, switch, merge
- [ ] Week 5 — Redis scaling, Docker, load testing, deployment
- [ ] Week 6 — README polish, architecture diagram, demo
