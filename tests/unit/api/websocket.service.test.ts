import { createServer, Server as HTTPServer } from 'http';

/** Loads the websocket module with a mocked Socket.IO constructor. */
function loadWebSocketModule() {
  type MockIoInstance = {
    on: jest.Mock;
    to: jest.Mock;
    emit: jest.Mock;
    engine: { clientsCount: number };
    connectionHandler?: (socket: unknown) => void;
  };

  const ioInstances: MockIoInstance[] = [];
  const SocketIOServerMock = jest.fn().mockImplementation(() => {
    const io = {} as MockIoInstance;
    io.on = jest.fn((event: string, listener: (socket: unknown) => void) => {
      if (event === 'connection') {
        io.connectionHandler = listener;
      }
      return io;
    });
    io.to = jest.fn(() => ({ emit: jest.fn().mockReturnValue(true) }));
    io.emit = jest.fn().mockReturnValue(true);
    io.engine = { clientsCount: 0 };
    ioInstances.push(io);
    return io;
  });

  jest.doMock('socket.io', () => ({
    __esModule: true,
    Server: SocketIOServerMock,
  }));

  let websocketModule!: typeof import('../../../apps/api/src/services/websocket.service');
  jest.isolateModules(() => {
    websocketModule = require('../../../apps/api/src/services/websocket.service');
  });

  return { websocketModule, SocketIOServerMock, ioInstances };
}

describe('websocket service bootstrap', () => {
  let fakeServer: HTTPServer | undefined;
  let resetWebSocketServiceForTesting: (() => void) | undefined;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    resetWebSocketServiceForTesting = undefined;
    fakeServer = createServer();
    await new Promise<void>(resolve => fakeServer!.listen(0, () => resolve()));
  });

  afterEach(async () => {
    if (resetWebSocketServiceForTesting) {
      resetWebSocketServiceForTesting();
    }
    if (fakeServer && fakeServer.listening) {
      await new Promise<void>(resolve => fakeServer!.close(() => resolve()));
    }
  });

  it('tracks authenticate and disconnect events with the injected socket adapter', () => {
    const { websocketModule } = loadWebSocketModule();
    resetWebSocketServiceForTesting = websocketModule.resetWebSocketServiceForTesting;

    const roomEmitter = { emit: jest.fn().mockReturnValue(true) };
    let connectionHandler!: (socket: unknown) => void;
    const fakeIo = {} as {
      on: jest.Mock;
      to: jest.Mock;
      emit: jest.Mock;
      engine: { clientsCount: number };
    };
    fakeIo.on = jest.fn((event: string, listener: (socket: unknown) => void) => {
      if (event === 'connection') {
        connectionHandler = listener;
      }
      return fakeIo;
    });
    fakeIo.to = jest.fn(() => roomEmitter);
    fakeIo.emit = jest.fn().mockReturnValue(true);
    fakeIo.engine = { clientsCount: 2 };

    const socketHandlers: Partial<Record<'authenticate' | 'disconnect', (...args: unknown[]) => void>> = {};
    const fakeSocket = {} as {
      id: string;
      on: jest.Mock;
      join: jest.Mock;
    };
    fakeSocket.id = 'socket-1';
    fakeSocket.on = jest.fn((event: 'authenticate' | 'disconnect', listener: (...args: unknown[]) => void) => {
      socketHandlers[event] = listener;
      return fakeSocket;
    });
    fakeSocket.join = jest.fn();

    const service = new websocketModule.WebSocketService({ io: fakeIo as any });
    connectionHandler(fakeSocket);
    socketHandlers.authenticate?.({ userId: 'user-1' });

    expect(fakeSocket.join).toHaveBeenCalledWith('user_user-1');
    expect(service.getUserSockets('user-1')).toEqual(['socket-1']);
    expect(service.getConnectedUsersCount()).toBe(1);
    expect(service.isUserConnected('user-1')).toBe(true);

    socketHandlers.disconnect?.();

    expect(service.getUserSockets('user-1')).toEqual([]);
    expect(service.getConnectedUsersCount()).toBe(0);
    expect(service.isUserConnected('user-1')).toBe(false);
  });

  it('delegates emits through the injected socket adapter', () => {
    const { websocketModule } = loadWebSocketModule();
    resetWebSocketServiceForTesting = websocketModule.resetWebSocketServiceForTesting;

    const roomEmitter = { emit: jest.fn().mockReturnValue(true) };
    const fakeIo = {} as {
      on: jest.Mock;
      to: jest.Mock;
      emit: jest.Mock;
      engine: { clientsCount: number };
    };
    fakeIo.on = jest.fn(() => fakeIo);
    fakeIo.to = jest.fn(() => roomEmitter);
    fakeIo.emit = jest.fn().mockReturnValue(true);
    fakeIo.engine = { clientsCount: 0 };

    const service = new websocketModule.WebSocketService({ io: fakeIo as any });
    service.emitToUser('user-1', 'notification_new', { id: 'notification-1' });

    expect(fakeIo.to).toHaveBeenCalledWith('user_user-1');
    expect(roomEmitter.emit).toHaveBeenCalledWith('notification_new', {
      id: 'notification-1',
    });
  });

  it('exposes and clears the active websocket service around initialization', () => {
    const { websocketModule, SocketIOServerMock } = loadWebSocketModule();
    resetWebSocketServiceForTesting = websocketModule.resetWebSocketServiceForTesting;

    expect(websocketModule.getWebSocketService()).toBeNull();

    const service = websocketModule.initializeWebSocket(fakeServer!);

    expect(SocketIOServerMock).toHaveBeenCalledTimes(1);
    expect(SocketIOServerMock).toHaveBeenCalledWith(fakeServer, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(','),
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });
    expect(websocketModule.getWebSocketService()).toBe(service);

    websocketModule.resetWebSocketServiceForTesting();

    expect(websocketModule.getWebSocketService()).toBeNull();
  });
});