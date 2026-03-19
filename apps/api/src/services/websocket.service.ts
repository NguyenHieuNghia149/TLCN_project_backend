import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

export class WebSocketService {
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

  emitToUser(userId: string, event: string, data: any): void {
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

export let websocketService: WebSocketService;

export const initializeWebSocket = (server: HTTPServer): WebSocketService => {
  websocketService = new WebSocketService(server);
  return websocketService;
};

