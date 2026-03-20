import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

export interface IWebSocketNotifier {
  emitToUser(userId: string, event: string, data: unknown): void;
  getIO(): { emit(event: string, data: unknown): boolean };
}

export class WebSocketService implements IWebSocketNotifier {
  private io: SocketIOServer;
  private connectedClients: Map<string, Set<string>> = new Map();

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(','),
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', socket => {
      socket.on('authenticate', (data: { userId: string }) => {
        if (data.userId) {
          if (!this.connectedClients.has(data.userId)) {
            this.connectedClients.set(data.userId, new Set());
          }
          this.connectedClients.get(data.userId)?.add(socket.id);
          socket.join(`user_${data.userId}`);
        }
      });

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

  emitToUser(userId: string, event: string, data: unknown): void {
    this.io.to(`user_${userId}`).emit(event, data);
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

  getIO(): SocketIOServer {
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

export const initializeWebSocket = (server: HTTPServer): WebSocketService => {
  websocketService = new WebSocketService(server);
  return websocketService;
};

/** Returns the active websocket service when it has been initialized, otherwise null. */
export function getWebSocketService(): IWebSocketNotifier | null {
  return websocketService;
}

/** Resets stored websocket state so tests can start from a clean module instance. */
export function resetWebSocketServiceForTesting(): void {
  websocketService = null;
}
