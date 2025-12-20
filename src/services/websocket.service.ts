import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { Request } from 'express';
import { createClient } from 'redis';

export interface SubmissionUpdate {
  submissionId: string;
  status: string;
  result?: {
    passed: number;
    total: number;
    results: Array<{
      index: number;
      input: string;
      expected: string;
      actual: string;
      ok: boolean;
      stderr: string;
      executionTime: number;
      error?: string;
    }>;
  };
  score?: number;
  message?: string;
}

export class WebSocketService {
  private io: SocketIOServer;
  private connectedClients: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    this.setupRedisSubscription();
  }

  private async setupRedisSubscription(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const subscriber = createClient({ url: redisUrl });

    subscriber.on('error', err => {
      // Silent error handling for Redis subscription
    });

    await subscriber.connect();

    await subscriber.subscribe('submission_updates', message => {
      try {
        const payload = JSON.parse(message);
        // Payload structure: { submissionId, data: { submissionId, status, result, ... } }
        // We want to emit the inner 'data' as the update
        if (payload && payload.submissionId && payload.data) {
          this.emitSubmissionUpdate(payload.submissionId, payload.data);
        }
      } catch (err) {
        // Silent error handling for Redis message processing
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', socket => {

      // Handle user authentication
      socket.on('authenticate', (data: { userId: string }) => {
        if (data.userId) {
          if (!this.connectedClients.has(data.userId)) {
            this.connectedClients.set(data.userId, new Set());
          }
          this.connectedClients.get(data.userId)?.add(socket.id);
          socket.join(`user_${data.userId}`);
        }
      });

      // Handle joining submission room
      socket.on('join_submission', (data: { submissionId: string }) => {
        socket.join(`submission_${data.submissionId}`);
      });

      // Handle leaving submission room
      socket.on('leave_submission', (data: { submissionId: string }) => {
        socket.leave(`submission_${data.submissionId}`);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        // Remove socket from user's connected clients
        for (const [userId, socketIds] of this.connectedClients.entries()) {
          if (socketIds.has(socket.id)) {
            socketIds.delete(socket.id);
            if (socketIds.size === 0) {
              this.connectedClients.delete(userId);
            }
            break;
          }
        }
      });
    });
  }

  // Emit submission queued event
  emitSubmissionQueued(data: {
    submissionId: string;
    status: string;
    queuePosition: number;
    problemId: string;
    language: string;
    estimatedWaitTime: number;
  }): void {
    this.io.emit('submission_queued', data);
  }

  // Emit submission status update
  emitSubmissionUpdate(submissionId: string, update: SubmissionUpdate): void {
    this.io.to(`submission_${submissionId}`).emit('submission_update', update);
  }

  // Emit submission completed
  emitSubmissionCompleted(data: {
    submissionId: string;
    status: string;
    result?: SubmissionUpdate['result'];
    score?: number;
  }): void {
    this.io.emit('submission_completed', data);
  }

  // Emit to specific user
  emitToUser(userId: string, event: string, data: any): void {
    this.io.to(`user_${userId}`).emit(event, data);
  }

  // Emit to specific submission room
  emitToSubmission(submissionId: string, event: string, data: any): void {
    this.io.to(`submission_${submissionId}`).emit(event, data);
  }

  // Get connected clients count
  getConnectedClientsCount(): number {
    return this.io.engine.clientsCount;
  }

  // Get connected users count
  getConnectedUsersCount(): number {
    return this.connectedClients.size;
  }

  // Get user's connected sockets
  getUserSockets(userId: string): string[] {
    return Array.from(this.connectedClients.get(userId) || []);
  }

  // Check if user is connected
  isUserConnected(userId: string): boolean {
    return this.connectedClients.has(userId) && this.connectedClients.get(userId)!.size > 0;
  }

  // Get server instance
  getIO(): SocketIOServer {
    return this.io;
  }

  // Health check
  getHealthInfo(): {
    connectedClients: number;
    connectedUsers: number;
    isHealthy: boolean;
  } {
    return {
      connectedClients: this.getConnectedClientsCount(),
      connectedUsers: this.getConnectedUsersCount(),
      isHealthy: this.io.engine.clientsCount > 0,
    };
  }
}

// Export singleton instance (will be initialized in main server file)
export let websocketService: WebSocketService;

export const initializeWebSocket = (server: HTTPServer): WebSocketService => {
  websocketService = new WebSocketService(server);
  return websocketService;
};
