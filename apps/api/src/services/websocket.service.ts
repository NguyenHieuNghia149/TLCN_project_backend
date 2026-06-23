import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { JWTUtils } from '@backend/shared/utils';
import { createProctoringWebSocketService } from './proctoring/proctoring-websocket.service';

export interface IWebSocketNotifier {
  emitToUser(userId: string, event: string, data: unknown): void;
  getIO(): { emit(event: string, data: unknown): boolean };
}

interface ISocketIOClientAdapter {
  id: string;
  handshake?: {
    headers?: {
      cookie?: string;
    };
  };
  on(event: 'disconnect', listener: () => void): this;
  join(room: string): void;
}

interface ISocketIOAdapter {
  on(event: 'connection', listener: (socket: ISocketIOClientAdapter) => void): this;
  to(room: string): { emit(event: string, data: unknown): boolean };
  emit(event: string, data: unknown): boolean;
  of?(namespace: string): {
    on(event: 'connection', listener: (socket: unknown) => void): unknown;
    to(room: string): { emit(event: string, data: unknown): boolean };
    emit(event: string, data: unknown): boolean;
  };
  engine: { clientsCount: number };
}

type WebSocketServiceDependencies = {
  io: ISocketIOAdapter;
};

export class WebSocketService implements IWebSocketNotifier {
  private readonly io: ISocketIOAdapter;
  private readonly connectedClients: Map<string, Set<string>> = new Map();

  constructor({ io }: WebSocketServiceDependencies) {
    this.io = io;
    this.setupEventHandlers();
    this.setupProctoringNamespace();
  }

  private setupProctoringNamespace(): void {
    if (typeof this.io.of !== 'function') {
      return;
    }

    createProctoringWebSocketService(this.io.of('/proctoring') as any);
  }

  private setupEventHandlers(): void {
    this.io.on('connection', socket => {
      const authenticatedUserId = this.getAuthenticatedUserId(socket);
      if (authenticatedUserId) {
        if (!this.connectedClients.has(authenticatedUserId)) {
          this.connectedClients.set(authenticatedUserId, new Set());
        }
        this.connectedClients.get(authenticatedUserId)?.add(socket.id);
        socket.join(`user_${authenticatedUserId}`);
      }

      socket.on('disconnect', () => {
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

  private getAuthenticatedUserId(socket: ISocketIOClientAdapter): string | null {
    const accessToken = this.readCookie(socket.handshake?.headers?.cookie, 'accessToken');
    if (!accessToken) {
      return null;
    }

    try {
      const payload = JWTUtils.verifyAccessToken(accessToken);
      return payload.type === 'access' ? payload.userId : null;
    } catch {
      return null;
    }
  }

  private readCookie(cookieHeader: string | undefined, cookieName: string): string | null {
    if (!cookieHeader) {
      return null;
    }

    const cookiePrefix = `${cookieName}=`;
    const entry = cookieHeader
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(cookiePrefix));

    if (!entry) {
      return null;
    }

    const value = entry.slice(cookiePrefix.length);
    return value ? decodeURIComponent(value) : null;
  }

  emitToUser(userId: string, event: string, data: unknown): void {
    const sockets = this.connectedClients.get(userId);
    if (sockets && sockets.size > 0) {
      this.io.to(`user_${userId}`).emit(event, data);
    }
  }

  getConnectedClientsCount(): number {
    return this.io.engine.clientsCount;
  }

  getConnectedUsersCount(): number {
    return this.connectedClients.size;
  }

  getUserSockets(userId: string): string[] {
    return Array.from(this.connectedClients.get(userId) || []);
  }

  isUserConnected(userId: string): boolean {
    return this.connectedClients.has(userId) && this.connectedClients.get(userId)!.size > 0;
  }

  getIO(): { emit(event: string, data: unknown): boolean } {
    return this.io;
  }

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

let websocketService: WebSocketService | null = null;

/** Creates a WebSocketService with a concrete Socket.IO server. */
export function createWebSocketService(server: HTTPServer): WebSocketService {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/api/socket.io',
    transports: ['websocket', 'polling'],
  }) as unknown as ISocketIOAdapter;

  return new WebSocketService({ io });
}

export const initializeWebSocket = (server: HTTPServer): WebSocketService => {
  const service = createWebSocketService(server);
  websocketService = service;
  return service;
};

/** Returns the active websocket service when it has been initialized, otherwise null. */
export function getWebSocketService(): IWebSocketNotifier | null {
  return websocketService;
}

/** Resets stored websocket state so tests can start from a clean module instance. */
export function resetWebSocketServiceForTesting(): void {
  websocketService = null;
}
