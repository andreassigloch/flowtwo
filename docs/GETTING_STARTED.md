# Getting Started with AiSE Reloaded

Complete guide to setting up and running the AiSE Reloaded Systems Engineering Assistant.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Manual Setup](#manual-setup)
4. [Development](#development)
5. [Production Deployment](#production-deployment)
6. [Troubleshooting](#troubleshooting)
7. [Architecture Overview](#architecture-overview)

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18.x or higher ([Download](https://nodejs.org/))
- **npm** 9.x or higher (comes with Node.js)
- **Docker** 24.x or higher ([Download](https://www.docker.com/))
- **Docker Compose** 2.x or higher
- **Git** (for version control)

### System Requirements

- **OS**: Linux, macOS, or Windows (with WSL2)
- **RAM**: Minimum 8GB (16GB recommended)
- **Disk**: Minimum 10GB free space
- **Network**: Internet connection for initial setup

---

## Quick Start

The fastest way to get AiSE Reloaded up and running:

```bash
# 1. Clone the repository
git clone <repository-url>
cd flowground

# 2. Run the development setup script
bash scripts/start-dev.sh
```

That's it! The script will:
- ✓ Check prerequisites
- ✓ Install dependencies
- ✓ Start Docker containers (Neo4j, Redis)
- ✓ Initialize the database
- ✓ Start frontend and backend servers

### Access the Application

Once the script completes, you can access:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **Neo4j Browser**: http://localhost:7474
  - Username: `neo4j`
  - Password: `aise_password_2024`

---

## Manual Setup

If you prefer manual control or need to debug issues:

### Step 1: Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your preferred editor
nano .env
```

Key environment variables:
```env
# Server
NODE_ENV=development
PORT=3001

# Neo4j Database
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=aise_password_2024

# WebSocket
WS_PORT=3001

# Frontend
VITE_WS_URL=ws://localhost:3001
VITE_API_URL=http://localhost:3001
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Start Infrastructure

```bash
# Start Neo4j and Redis
docker-compose up -d neo4j redis

# Check container status
docker-compose ps

# View logs
docker-compose logs -f
```

### Step 4: Initialize Database

```bash
# Run database initialization
bash scripts/init-db.sh

# Verify database
docker exec aise-neo4j cypher-shell -u neo4j -p aise_password_2024 "MATCH (n) RETURN count(n);"
```

### Step 5: Start Development Servers

```bash
# Option A: Start both frontend and backend together
npm run dev

# Option B: Start separately in different terminals
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
npm run dev:frontend
```

---

## Development

### Project Structure

```
flowground/
├── src/
│   ├── backend/          # Express + WebSocket server
│   │   ├── server.ts
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   └── websocket/
│   ├── frontend/         # React application
│   │   ├── App.tsx       # Main app with 3 canvases
│   │   ├── components/
│   │   │   ├── ChatCanvas/
│   │   │   ├── TextCanvas/
│   │   │   ├── GraphCanvas/
│   │   │   ├── Layout/
│   │   │   ├── Toolbar.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   └── Notifications.tsx
│   │   ├── store/        # Zustand global state
│   │   ├── hooks/
│   │   └── services/
│   ├── sync/             # Canvas synchronization
│   ├── validation/       # Ontology validators
│   ├── types/            # TypeScript types
│   └── database/         # Neo4j client
├── scripts/              # Setup scripts
├── tests/                # Test suites
├── ontology_schema.json  # Ontology V3 definition
└── docker-compose.yml    # Container orchestration
```

### Available Scripts

```bash
# Development
npm run dev              # Start full dev environment
npm run dev:backend      # Backend only
npm run dev:frontend     # Frontend only

# Building
npm run build            # Build both
npm run build:backend    # Backend only
npm run build:frontend   # Frontend only

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
npm run test:validation  # Validation tests only

# Docker
npm run docker:up        # Start containers
npm run docker:down      # Stop containers
npm run docker:logs      # View logs

# Database
npm run db:init          # Initialize database

# Type checking
npm run typecheck        # Check TypeScript types
```

### Canvas Integration

The application features three synchronized canvases:

#### 1. Chat Canvas
- Conversational AI interface
- Editable LLM outputs
- Real-time streaming
- Presence indicators

#### 2. Text Canvas
- Tabular view of ontology data
- Inline editing
- Filtering and sorting
- Bulk operations
- Export to PDF/CSV

#### 3. Graph Canvas
- Visual graph representation
- Interactive nodes and edges
- Multiple layout algorithms
- Zoom and pan
- Node filtering

All canvases share a single WebSocket connection and synchronize state in real-time using operational transform.

### Layout Modes

Switch between different layout modes in settings:

- **Tabs**: Full-screen tabs (Chat | Text | Graph)
- **Horizontal Split**: Chat left, Text/Graph tabs right
- **Vertical Split**: Chat top, Text/Graph tabs bottom
- **Three Column**: All canvases visible simultaneously

---

## Production Deployment

### Option 1: Docker Compose (Recommended)

```bash
# 1. Build production images
docker-compose -f docker-compose.prod.yml build

# 2. Start services
docker-compose -f docker-compose.prod.yml up -d

# 3. Check health
docker-compose -f docker-compose.prod.yml ps
```

### Option 2: Manual Deployment

```bash
# 1. Build application
npm run build

# 2. Set production environment
export NODE_ENV=production

# 3. Start server
npm run start:prod
```

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3001

# Use production Neo4j instance
NEO4J_URI=bolt://production-neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<strong-password>

# Security
SESSION_SECRET=<random-secret>
JWT_SECRET=<random-secret>

# CORS
CORS_ORIGIN=https://yourdomain.com
```

### Health Checks

```bash
# Backend health
curl http://localhost:3001/health

# Neo4j health
docker exec aise-neo4j cypher-shell -u neo4j -p password "RETURN 1;"
```

---

## Troubleshooting

### Common Issues

#### 1. Docker not starting

```bash
# Check Docker status
systemctl status docker

# Start Docker
sudo systemctl start docker
```

#### 2. Port already in use

```bash
# Find process using port 3001
lsof -i :3001

# Kill process
kill -9 <PID>
```

#### 3. Neo4j connection failed

```bash
# Check Neo4j logs
docker-compose logs neo4j

# Restart Neo4j
docker-compose restart neo4j

# Verify connection
docker exec aise-neo4j cypher-shell -u neo4j -p aise_password_2024 "RETURN 1;"
```

#### 4. Frontend build errors

```bash
# Clear cache
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf .vite
```

#### 5. WebSocket connection issues

Check CORS settings in `.env`:
```env
CORS_ORIGIN=http://localhost:5173
```

Check firewall rules allow WebSocket connections on port 3001.

### Logs

```bash
# Application logs
npm run docker:logs

# Specific service
docker-compose logs -f backend
docker-compose logs -f neo4j

# Backend logs (if running locally)
tail -f logs/backend.log
```

### Reset Everything

```bash
# Stop all containers
docker-compose down

# Remove volumes (WARNING: deletes all data)
docker-compose down -v

# Rebuild from scratch
bash scripts/start-dev.sh
```

---

## Architecture Overview

### Technology Stack

- **Frontend**: React 18, TypeScript, Zustand, Vite
- **Backend**: Node.js, Express, WebSocket (ws)
- **Database**: Neo4j 5.x Community Edition
- **Orchestration**: claude-flow multi-agent system
- **Real-time Sync**: Operational Transform (OT)

### Key Features

1. **Triple Canvas System**: Chat, Text, and Graph views synchronized in real-time
2. **WebSocket Communication**: Single connection for all canvases
3. **Operational Transform**: Conflict-free concurrent editing
4. **Presence Management**: See who's editing what in real-time
5. **Ontology Validation**: Continuous validation against Ontology V3 rules
6. **Multi-User Support**: Up to 10 concurrent users
7. **Audit Trail**: Complete history of all changes

### Performance Targets

- **Canvas Update Latency**: <100ms
- **WebSocket Message Latency**: <50ms
- **Validation**: <500ms for full ontology
- **Graph Rendering**: 60 FPS for up to 1000 nodes

---

## Next Steps

- Read [CLAUDE.md](../CLAUDE.md) for project overview
- Read [README-SYNC.md](../README-SYNC.md) for sync engine details
- Read [VALIDATION_IMPLEMENTATION_SUMMARY.md](../VALIDATION_IMPLEMENTATION_SUMMARY.md) for validation rules
- Explore [ontology_schema.json](../ontology_schema.json) for Ontology V3 structure

## Support

For issues or questions:
- Check existing documentation
- Review logs for error messages
- Open an issue in the repository

---

**Happy Building! 🚀**
