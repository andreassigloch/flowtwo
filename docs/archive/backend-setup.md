# AiSE Reloaded - Backend Setup Guide

## Overview

This guide walks you through setting up and running the AiSE Reloaded backend server.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Client Layer                       │
│  (Web Browser, Canvas UI, Real-time Collaboration)  │
└─────────────┬───────────────────────┬───────────────┘
              │                       │
              │ REST API              │ WebSocket
              │                       │
┌─────────────▼───────────────────────▼───────────────┐
│              Express.js Server                       │
│  ┌──────────────────────────────────────────────┐  │
│  │          Middleware Layer                     │  │
│  │  • CORS, Helmet, Compression                 │  │
│  │  • Audit Logging                             │  │
│  │  • Rate Limiting                             │  │
│  │  • Error Handling                            │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │          Route Handlers                       │  │
│  │  • Nodes API                                 │  │
│  │  • Relationships API                         │  │
│  │  • Validation API                            │  │
│  │  • Audit & Statistics                        │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │          WebSocket Server                     │  │
│  │  • Room Manager (Multi-user rooms)           │  │
│  │  • Operational Transform (Conflict resolve)  │  │
│  │  • Real-time Canvas Sync                     │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │          Services Layer                       │  │
│  │  • Neo4j Service (Database operations)       │  │
│  │  • Validator Service (Ontology rules)        │  │
│  └──────────────────────────────────────────────┘  │
└─────────────┬───────────────────────────────────────┘
              │
              │ Cypher Queries
              │
┌─────────────▼───────────────────────────────────────┐
│              Neo4j Graph Database                    │
│  • Nodes: SYS, UC, FUNC, FLOW, REQ, TEST, etc.      │
│  • Relationships: compose, io, satisfy, verify       │
└─────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Software

1. **Node.js** (v18 or higher)
   ```bash
   node --version  # Should be v18.x or higher
   ```

2. **Neo4j Database** (Community Edition 5.x)
   - Download: https://neo4j.com/download/
   - Or use Docker:
     ```bash
     docker run -d \
       --name neo4j \
       -p 7474:7474 -p 7687:7687 \
       -e NEO4J_AUTH=neo4j/password \
       neo4j:5-community
     ```

3. **npm or yarn**
   ```bash
   npm --version
   ```

### System Requirements

- **Memory:** Minimum 2GB RAM (4GB recommended)
- **Storage:** 1GB free space
- **OS:** Linux, macOS, or Windows with WSL2

## Installation

### 1. Clone Repository

```bash
git clone <repository-url>
cd flowground
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages:
- express (REST API framework)
- ws (WebSocket server)
- neo4j-driver (Neo4j database driver)
- winston (Logging)
- joi (Validation)
- And more...

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j

# WebSocket Configuration
WS_PORT=3001

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=logs/aise-backend.log

# Multi-user settings
MAX_CONCURRENT_USERS=10
```

### 4. Setup Neo4j Database

#### Option A: Local Installation

1. Start Neo4j:
   ```bash
   # macOS/Linux
   neo4j start

   # Windows
   neo4j.bat start
   ```

2. Access Neo4j Browser: http://localhost:7474

3. Login with default credentials:
   - Username: neo4j
   - Password: neo4j
   - You'll be prompted to change the password

4. Update `.env` with your new password

#### Option B: Docker

```bash
# Start Neo4j container
docker run -d \
  --name aise-neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/yourpassword \
  -v $PWD/neo4j-data:/data \
  neo4j:5-community

# Check logs
docker logs aise-neo4j

# Access browser
open http://localhost:7474
```

### 5. Build TypeScript

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

## Running the Server

### Development Mode (with hot reload)

```bash
npm run dev
```

The server will:
- Start on port 3000 (or PORT from .env)
- Auto-reload on file changes
- Show detailed logs in console
- WebSocket available at ws://localhost:3000/ws

### Production Mode

```bash
# Build first
npm run build

# Start server
npm start
```

### Verify Server is Running

```bash
# Health check
curl http://localhost:3000/health

# API info
curl http://localhost:3000/api

# Database stats
curl http://localhost:3000/api/stats/database
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0"
}
```

## Testing the Setup

### 1. Create a Test Node

```bash
curl -X POST http://localhost:3000/api/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "type": "SYS",
    "properties": {
      "Name": "TestSystem",
      "Descr": "Test system description"
    }
  }'
```

### 2. Get All Nodes

```bash
curl http://localhost:3000/api/nodes
```

### 3. Validate Graph

```bash
curl http://localhost:3000/api/validation/graph
```

### 4. WebSocket Connection Test

Create a simple HTML file `test-websocket.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>WebSocket Test</title>
</head>
<body>
    <h1>WebSocket Test</h1>
    <div id="status">Connecting...</div>
    <div id="messages"></div>

    <script>
        const ws = new WebSocket('ws://localhost:3000/ws');

        ws.onopen = () => {
            document.getElementById('status').textContent = 'Connected!';

            // Join a room
            ws.send(JSON.stringify({
                type: 'join-room',
                payload: {
                    roomId: 'test-room',
                    userId: 'test-user',
                    username: 'Test User'
                },
                timestamp: Date.now()
            }));
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            const div = document.createElement('div');
            div.textContent = JSON.stringify(msg, null, 2);
            document.getElementById('messages').appendChild(div);
        };

        ws.onerror = (error) => {
            document.getElementById('status').textContent = 'Error: ' + error;
        };
    </script>
</body>
</html>
```

Open in browser and check console for messages.

## Directory Structure

```
flowground/
├── src/
│   └── backend/
│       ├── server.ts              # Main server entry point
│       ├── types/
│       │   └── index.ts           # TypeScript type definitions
│       ├── services/
│       │   ├── neo4j.service.ts   # Database operations
│       │   └── validator.service.ts # Ontology validation
│       ├── middleware/
│       │   ├── audit.middleware.ts
│       │   ├── error.middleware.ts
│       │   ├── rateLimit.middleware.ts
│       │   └── validator.middleware.ts
│       ├── routes/
│       │   ├── nodes.routes.ts
│       │   ├── relationships.routes.ts
│       │   └── validation.routes.ts
│       ├── websocket/
│       │   ├── websocket.server.ts
│       │   ├── room.manager.ts
│       │   └── ot.service.ts
│       └── utils/
│           └── logger.ts
├── dist/                          # Compiled JavaScript (generated)
├── logs/                          # Log files
├── docs/
│   ├── api-documentation.md       # API reference
│   └── backend-setup.md           # This file
├── ontology_schema.json           # Ontology V3 definition
├── tsconfig.json                  # TypeScript config
├── package.json                   # Dependencies
└── .env                           # Environment variables
```

## Logging

Logs are written to:
- **Console:** Development mode
- **File:** `logs/aise-backend.log` (JSON format)
- **Error file:** `logs/error.log`

Log levels:
- `error`: Critical errors
- `warn`: Warnings
- `info`: General info (default)
- `debug`: Detailed debug info

Change log level in `.env`:
```bash
LOG_LEVEL=debug
```

View logs:
```bash
# Tail main log
tail -f logs/aise-backend.log

# Tail error log
tail -f logs/error.log

# Pretty print JSON logs
tail -f logs/aise-backend.log | jq .
```

## Performance Tuning

### Neo4j Optimization

Edit `neo4j.conf`:

```conf
# Memory settings
dbms.memory.heap.initial_size=1G
dbms.memory.heap.max_size=2G
dbms.memory.pagecache.size=1G

# Performance
dbms.memory.transaction.total.max=1G
```

### Node.js Optimization

For production:

```bash
# Increase max memory
NODE_OPTIONS="--max-old-space-size=4096" npm start

# Use clustering for multi-core
# (requires additional setup)
```

### Rate Limiting

Adjust in `.env`:
```bash
RATE_LIMIT_WINDOW_MS=60000      # 1 minute
RATE_LIMIT_MAX_REQUESTS=1000    # Higher for production
```

## Troubleshooting

### Cannot Connect to Neo4j

**Error:** `Failed to connect to Neo4j database`

**Solutions:**
1. Verify Neo4j is running:
   ```bash
   neo4j status
   ```

2. Test connection:
   ```bash
   cypher-shell -a bolt://localhost:7687 -u neo4j -p password
   ```

3. Check `.env` credentials match Neo4j settings

### Port Already in Use

**Error:** `EADDRINUSE: address already in use :::3000`

**Solutions:**
1. Kill process using port:
   ```bash
   # Find process
   lsof -i :3000

   # Kill process
   kill -9 <PID>
   ```

2. Change port in `.env`:
   ```bash
   PORT=3001
   ```

### TypeScript Compilation Errors

**Error:** Type errors during `npm run build`

**Solutions:**
1. Clean and rebuild:
   ```bash
   rm -rf dist/
   npm run build
   ```

2. Check TypeScript version:
   ```bash
   npx tsc --version
   ```

### WebSocket Connection Failed

**Error:** WebSocket connection refused

**Solutions:**
1. Verify server is running
2. Check firewall settings
3. Test with curl:
   ```bash
   curl -i -N \
     -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: test" \
     http://localhost:3000/ws
   ```

### High Memory Usage

**Solutions:**
1. Monitor Node.js heap:
   ```bash
   node --expose-gc --trace-gc dist/backend/server.js
   ```

2. Reduce audit log size in code:
   ```typescript
   // middleware/audit.middleware.ts
   const MAX_AUDIT_LOG_SIZE = 1000; // Reduce from 10000
   ```

3. Restart server periodically

## Development Workflow

### Making Changes

1. Edit TypeScript files in `src/backend/`
2. Changes auto-reload in dev mode
3. Test your changes
4. Build for production: `npm run build`

### Adding New Endpoints

1. Create route handler in `src/backend/routes/`
2. Register in `src/backend/server.ts`:
   ```typescript
   this.app.use('/api/myroute', createMyRouter(...));
   ```
3. Update API documentation

### Adding New Node Types

1. Update `ontology_schema.json`
2. Update TypeScript types in `src/backend/types/index.ts`
3. Add validation rules in `src/backend/services/validator.service.ts`
4. Document in API docs

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Use strong Neo4j password
- [ ] Configure proper CORS origins
- [ ] Set up log rotation
- [ ] Enable HTTPS (reverse proxy)
- [ ] Configure firewall
- [ ] Set up monitoring
- [ ] Configure backup strategy
- [ ] Document deployment process
- [ ] Test failover scenarios

### Using PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start dist/backend/server.js --name aise-backend

# Monitor
pm2 monit

# Logs
pm2 logs aise-backend

# Restart
pm2 restart aise-backend

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/backend/server.js"]
```

Build and run:

```bash
docker build -t aise-backend .
docker run -d -p 3000:3000 --name aise aise-backend
```

## Monitoring

### Health Checks

```bash
# Simple health check
curl http://localhost:3000/health

# Database stats
curl http://localhost:3000/api/stats/database

# WebSocket stats
curl http://localhost:3000/api/stats/websocket

# Audit stats
curl http://localhost:3000/api/audit/stats
```

### Performance Metrics

Monitor:
- Response times (target: <100ms)
- WebSocket latency (target: <50ms)
- Database query times
- Memory usage
- Active connections

Use tools:
- New Relic, DataDog (APM)
- Grafana + Prometheus (metrics)
- ELK Stack (logs)

## Security

### Best Practices

1. **Environment Variables:** Never commit `.env`
2. **Authentication:** Implement JWT auth (TODO)
3. **Input Validation:** All inputs validated with Joi
4. **Rate Limiting:** Enabled by default
5. **CORS:** Configure allowed origins
6. **Helmet:** Security headers enabled
7. **Audit Logs:** All operations logged
8. **Neo4j:** Use read-only user for queries

### Security Headers

Already configured via Helmet:
- Content-Security-Policy
- X-Content-Type-Options
- X-Frame-Options
- Strict-Transport-Security

## Next Steps

1. **Frontend Integration:** Connect React/Vue frontend
2. **Authentication:** Add JWT-based auth
3. **Authorization:** Role-based access control
4. **Testing:** Add unit and integration tests
5. **CI/CD:** Set up automated deployment
6. **Monitoring:** Integrate APM solution
7. **Documentation:** Add inline code comments

## Support

For issues or questions:
- Check logs: `logs/aise-backend.log`
- Review API docs: `docs/api-documentation.md`
- Check Neo4j logs
- Enable debug logging: `LOG_LEVEL=debug`

## License

ISC License - See LICENSE file for details
