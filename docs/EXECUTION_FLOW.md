# 🔄 Luồng Thực Thi Code - Code Execution Flow

## 📋 Tổng Quan

Hệ thống Code Execution Platform sử dụng kiến trúc microservices với các thành phần chính:

- **API Server** (Port 3000): Xử lý requests, authentication, database
- **Sandbox Service** (Port 4000): Thực thi code trong môi trường isolated
- **Worker Service** (Background): Xử lý queue, giao tiếp với sandbox
- **Redis Queue**: Quản lý jobs
- **PostgreSQL**: Lưu trữ dữ liệu
- **Nginx**: Load balancer và reverse proxy

## 🔄 Luồng Thực Thi Chi Tiết

### 1. **Client Submit Code**

```
Client → API Server (Port 3000)
```

**Bước 1.1: Validation & Authentication**

- Kiểm tra JWT token
- Validate input data (code, language, testcases)
- Rate limiting check

**Bước 1.2: Create Submission**

- Tạo record trong database (status: PENDING)
- Generate submission ID
- Emit WebSocket event: `submission_queued`

### 2. **Queue Job Processing**

```
API Server → Redis Queue → Worker Service
```

**Bước 2.1: Add to Queue**

- Tạo job object với submission data
- Push vào Redis queue với priority
- Return submission ID cho client

**Bước 2.2: Worker Pickup**

- Worker service polling Redis queue
- Dequeue job khi có available
- Update submission status: RUNNING

### 3. **Sandbox Execution**

```
Worker Service → Sandbox Service (Port 4000) → Docker Container
```

**Bước 3.1: Security Validation**

- Kiểm tra malicious patterns (50+ patterns)
- Validate code length và complexity
- Language-specific security checks

**Bước 3.2: Docker Container Creation**

- Tạo isolated workspace
- Mount code files
- Apply security constraints:
  - `--memory 128m --memory-swap 128m`
  - `--cpus 1.0`
  - `--network none`
  - `--read-only`
  - `--user 1000:1000`
  - `--cap-drop=ALL`
  - `--security-opt=no-new-privileges`
  - `--security-opt=seccomp=./security/seccomp.json`

**Bước 3.3: Code Compilation (nếu cần)**

- C++: `g++ -std=c++17 -O2 -static -s`
- Java: `javac Main.java`
- Python/JS: Không cần compile

**Bước 3.4: Test Case Execution**

- Chạy từng test case trong container
- Input/Output redirection
- Timeout và memory monitoring
- Resource usage tracking

### 4. **Result Processing**

```
Sandbox Service → Worker Service → Database
```

**Bước 4.1: Collect Results**

- Gather stdout, stderr, exit code
- Calculate execution time
- Check resource limits

**Bước 4.2: Determine Status**

- Sử dụng `JudgeUtils.determineFinalStatus` (tại `src/utils/judge.ts`) để xác định trạng thái dựa trên kết quả test cases.
- Các trạng thái chuẩn hóa:
  - `ACCEPTED`: Tất cả test cases pass
  - `WRONG_ANSWER`: Một số test cases fail
  - `TIME_LIMIT_EXCEEDED`: Timeout
  - `MEMORY_LIMIT_EXCEEDED`: Memory limit
  - `RUNTIME_ERROR`: Runtime error
  - `COMPILATION_ERROR`: Compilation failed

**Bước 4.3: Calculate Score**

- Sử dụng `JudgeUtils.calculateScore` để tính điểm dựa trên trọng số (points) của từng test case.
- Score = (passed_points / total_points) \* 100
- Store kết quả và score trong database thông qua `SubmissionService`.

### 5. **Real-time Updates**

```
Worker Service → WebSocket → Client
```

**Bước 5.1: Emit Events**

- `submission_running`: Khi bắt đầu execute
- `submission_completed`: Khi hoàn thành
- `submission_error`: Khi có lỗi

**Bước 5.2: Client Response**

- Real-time status updates
- Final results display
- Error messages

## 🏗️ Kiến Trúc Chi Tiết

### **API Server (Port 3000)**

```typescript
// Standardized API Response Format
{
  "success": boolean,
  "data": any | null,
  "error": {
    "code": string,
    "message": string,
    "details": any | null
  } | null
}

// Endpoints
POST /api/submissions          // Submit code
GET  /api/submissions/:id      // Get submission status
GET  /api/health               // Health check

// WebSocket Events
submission_queued              // Job added to queue
submission_running             // Job started processing
submission_completed           // Job finished successfully
submission_error               // Job failed
```

### **Sandbox Service (Port 4000)**

Note: /api/sandbox/* endpoints are served by the sandbox service directly for ops/debug and are no longer mounted by the API app.

```typescript
// Endpoints
POST /api/sandbox/execute      // Execute code
GET  /api/sandbox/status       // Sandbox status
GET  /api/sandbox/health       // Health check

// Security Features
- Container isolation
- Resource limits
- Malicious code detection
- Seccomp profiles
- AppArmor profiles
```

### **Worker Service (Background)**

```typescript
// Functions
- Poll Redis queue
- Process jobs
- Communicate with sandbox
- Update database
- Emit WebSocket events
```

## 🔒 Security Layers

### **1. API Security**

- JWT Authentication
- Rate limiting (60 req/min)
- Input validation (Zod schemas)
- CORS protection

### **2. Sandbox Security**

- Docker container isolation
- No network access
- Read-only filesystem
- Non-root user execution
- Resource limits (CPU, memory, time)
- Seccomp profile restrictions
- AppArmor security profiles

### **3. Code Validation**

- 50+ malicious patterns detection
- Language-specific rules
- Code length limits
- Complexity analysis
- Real-time monitoring

### **4. Network Security**

- Internal service communication
- Nginx reverse proxy
- Load balancing
- SSL/TLS encryption

## 📊 Monitoring & Logging

### **Health Checks**

- API Server: `http://localhost:3000/api/health`
- Sandbox Service: `http://localhost:4000/health`
- Database: Connection status
- Redis: Queue status

### **Metrics**

- Request count và response times
- Queue length và processing time
- Sandbox resource usage
- Security events và violations
- Error rates và types

### **Logging**

- Structured JSON logs
- Security event logging
- Performance metrics
- Error tracking

## ⚡ Performance Optimization

### **Horizontal Scaling**

- Multiple worker instances
- Load balancer distribution
- Queue-based processing
- Resource pooling

### **Caching**

- Redis for session storage
- Database connection pooling
- Static asset caching
- Response caching

### **Resource Management**

- Container resource limits
- Queue priority handling
- Timeout management
- Memory optimization

## 🚀 Deployment

### **Development**

```bash
# Start all services
npm run dev:all

# Or individually
npm run dev          # API Server
npm run dev:sandbox  # Sandbox Service
npm run dev:worker   # Worker Service
```

### **Production**

```bash
# Docker Compose
docker-compose up -d

# Scale workers
docker-compose up --scale worker=3
```

## 🔧 Configuration

### **Environment Variables**

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

### **Docker Configuration**

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

## 🎯 Key Benefits

### **Security**

- Multi-layer security approach
- Container isolation
- Real-time threat detection
- Resource protection

### **Performance**

- Asynchronous processing
- Horizontal scaling
- Resource optimization
- Load balancing

### **Reliability**

- Fault isolation
- Error handling
- Health monitoring
- Graceful degradation

### **Maintainability**

- Microservices architecture
- Independent deployment
- Modular design
- Clear separation of concerns

---

**🎯 Kết luận**: Hệ thống này đảm bảo thực thi code an toàn, hiệu quả và có thể mở rộng với kiến trúc microservices hiện đại! 🚀✨
