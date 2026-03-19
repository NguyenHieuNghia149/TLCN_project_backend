# 🏗️ Sandbox Architecture

## Overview

Hệ thống Code Execution Platform đã được tách thành các microservices riêng biệt để đảm bảo tính bảo mật và hiệu suất tối ưu.

## 🏛️ Architecture Components

### 1. **API Server** (Port 3000)

- **Chức năng**: Main API server, authentication, database operations
- **Endpoints**: `/api/auth`, `/api/submissions`, `/api/security`
- **Dependencies**: PostgreSQL, Redis
- **Security**: Authentication, authorization, rate limiting

### 2. **Sandbox Service** (Port 4000)

- **Chức năng**: Isolated code execution environment
- **Endpoints**: `/api/sandbox/execute`, `/api/sandbox/status`, `/api/sandbox/health` (served directly by the sandbox service, not mounted by the API app)
- **Dependencies**: Docker, Security profiles
- **Security**: Container isolation, resource limits, malicious code detection

### 3. **Worker Service** (Background)

- **Chức năng**: Process submission queue, communicate with sandbox
- **Dependencies**: Redis queue, Sandbox service
- **Security**: Queue-based processing, error handling

### 4. **Database** (PostgreSQL)

- **Chức năng**: Store submissions, users, problems, results
- **Security**: Connection pooling, data encryption

### 5. **Queue** (Redis)

- **Chức năng**: Job queue for submission processing
- **Security**: Message encryption, access control

## 🔄 Request Flow

```mermaid
graph TD
    A[Client] --> B[API Server :3000]
    B --> C[Database]
    B --> D[Redis Queue]
    D --> E[Worker Service]
    E --> F[Sandbox Service :4000]
    F --> G[Docker Container]
    G --> H[Security Validation]
    H --> I[Code Execution]
    I --> J[Result Processing]
    J --> K[Database Update]
    K --> L[Client Response]
```

## 🚀 Quick Start

### Development Mode

```bash
# Start all services
npm run start:all

# Or start individually
npm run dev          # API Server
npm run dev:sandbox  # Sandbox Service
npm run dev:worker   # Worker Service
```

### Production Mode

```bash
# Using Docker Compose
docker-compose up -d

# Or using PM2
npm run build
pm2 start ecosystem.config.js
```

## 🧪 Testing

```bash
# Test security features
npm run test:security

# Test sandbox service
npm run test:sandbox

# Test all components
npm run test
```

## 🔒 Security Features

### Sandbox Isolation

- **Docker Containers**: Each code execution runs in isolated container
- **Resource Limits**: CPU, memory, time, file size limits
- **Network Isolation**: No network access
- **File System**: Read-only filesystem
- **User Isolation**: Non-root user execution

### Code Validation

- **Pattern Detection**: 50+ malicious patterns
- **Language-Specific**: Different rules for each language
- **Real-time Monitoring**: Security events logging
- **Resource Monitoring**: Usage tracking and limits

### API Security

- **Authentication**: JWT tokens
- **Rate Limiting**: Request throttling
- **Input Validation**: Zod schema validation
- **CORS**: Cross-origin protection

## 📊 Monitoring

### Health Checks

- **API Server**: `http://localhost:3000/api/health`
- **Sandbox Service**: `http://localhost:4000/health`
- **Database**: Connection status
- **Redis**: Queue status

### Security Monitoring

- **Security Events**: Real-time logging
- **Resource Usage**: CPU, memory tracking
- **Malicious Code**: Pattern detection
- **Performance**: Response times

## 🔧 Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgres://user:password@localhost:5432/coding_platform

# Redis
REDIS_URL=redis://localhost:6379

# Sandbox
SANDBOX_URL=http://localhost:4000
SANDBOX_PORT=4000
WORKSPACE_DIR=./workspace

# Security
SECURITY_LOG_LEVEL=info
MAX_CONCURRENT_JOBS=5
```

### Docker Configuration

```yaml
# docker-compose.yml
services:
  api:
    ports: ['3000:3000']
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:password@postgres:5432/coding_platform
      - REDIS_URL=redis://redis:6379
      - SANDBOX_URL=http://sandbox:4000

  sandbox:
    ports: ['4000:4000']
    privileged: true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./workspace:/app/workspace

  worker:
    environment:
      - SANDBOX_URL=http://sandbox:4000
    deploy:
      replicas: 2
```

## 🎯 API Endpoints

### API Server (Port 3000)

```
POST /api/submissions          # Submit code
GET  /api/submissions/:id      # Get submission status
GET  /api/security/stats       # Security statistics
GET  /api/health               # Health check
```

### Sandbox Service (Port 4000)

These /api/sandbox/* endpoints remain available on the sandbox service for ops/debug. The API app no longer mounts them.

```
POST /api/sandbox/execute      # Execute code
GET  /api/sandbox/status       # Sandbox status
GET  /api/sandbox/health       # Health check
GET  /api/sandbox/test         # Test sandbox
```

## 🛡️ Security Best Practices

### 1. **Container Security**

- Use minimal base images
- Drop all capabilities
- Read-only filesystem
- No network access
- User isolation

### 2. **Code Validation**

- Static analysis before execution
- Pattern-based detection
- Language-specific rules
- Real-time monitoring

### 3. **Resource Management**

- Strict memory limits
- CPU time limits
- File size limits
- Process limits
- Timeout enforcement

### 4. **Network Security**

- Internal service communication
- Load balancer protection
- Rate limiting
- CORS configuration

## 📈 Performance Optimization

### 1. **Horizontal Scaling**

- Multiple worker instances
- Load balancer distribution
- Queue-based processing
- Resource pooling

### 2. **Caching**

- Redis for session storage
- Database connection pooling
- Static asset caching
- Response caching

### 3. **Monitoring**

- Real-time metrics
- Performance tracking
- Error monitoring
- Resource usage

## 🔧 Troubleshooting

### Common Issues

1. **Sandbox Service Not Responding**

   ```bash
   # Check if Docker is running
   docker --version

   # Check sandbox health
   curl http://localhost:4000/health
   ```

2. **Database Connection Failed**

   ```bash
   # Check PostgreSQL status
   pg_isready -h localhost -p 5432

   # Check connection string
   echo $DATABASE_URL
   ```

3. **Redis Connection Failed**

   ```bash
   # Check Redis status
   redis-cli ping

   # Check connection string
   echo $REDIS_URL
   ```

### Debug Commands

```bash
# View logs
docker-compose logs -f

# Check service status
docker-compose ps

# Restart services
docker-compose restart

# Scale workers
docker-compose up --scale worker=3
```

## 🎉 Benefits of Microservices Architecture

### 1. **Security**

- Isolated execution environment
- Separate security boundaries
- Independent scaling
- Fault isolation

### 2. **Performance**

- Dedicated resources
- Optimized for specific tasks
- Horizontal scaling
- Load distribution

### 3. **Maintainability**

- Independent deployment
- Technology diversity
- Easier debugging
- Modular development

### 4. **Scalability**

- Service-specific scaling
- Resource optimization
- Load balancing
- High availability

---

**🎯 Kết luận**: Hệ thống microservices này đảm bảo tính bảo mật cao, hiệu suất tốt và khả năng mở rộng linh hoạt cho Code Execution Platform! 🚀✨
