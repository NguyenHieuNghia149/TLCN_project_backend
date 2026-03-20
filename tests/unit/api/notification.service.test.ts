const mockCreate = jest.fn();
const mockCreateMany = jest.fn();
const mockFindByUserId = jest.fn();
const mockCountUnread = jest.fn();
const mockMarkAsRead = jest.fn();
const mockMarkAllAsRead = jest.fn();
const mockFindAllIds = jest.fn();

jest.mock('../../../apps/api/src/repositories/notification.repository', () => ({
  NotificationRepository: jest.fn(() => ({
    create: mockCreate,
    createMany: mockCreateMany,
    findByUserId: mockFindByUserId,
    countUnread: mockCountUnread,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
  })),
}));

jest.mock('../../../apps/api/src/repositories/user.repository', () => ({
  UserRepository: jest.fn(() => ({
    findAllIds: mockFindAllIds,
  })),
}));

import {
  createNotificationService,
  NotificationService,
} from '../../../apps/api/src/services/notification.service';
import { resetWebSocketServiceForTesting } from '../../../apps/api/src/services/websocket.service';

describe('notification service factories', () => {
  const examMetadata = {
    examId: '11111111-1111-4111-8111-111111111111',
    link: '/exams/11111111-1111-4111-8111-111111111111',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindAllIds.mockResolvedValue([]);
  });

  afterEach(() => {
    resetWebSocketServiceForTesting();
  });

  it('creates a notification service without requiring initialized websocket state', () => {
    expect(createNotificationService()).toBeInstanceOf(NotificationService);
  });

  it('skips socket emits when the websocket provider returns null', async () => {
    mockCreate.mockResolvedValue({ id: 'notification-1' });

    const service = createNotificationService(() => null);
    const created = await service.notifyUser(
      'user-1',
      'NEW_EXAM',
      'Title',
      'Message',
      examMetadata
    );

    expect(created).toEqual({ id: 'notification-1' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('emits through the provided websocket notifier when available', async () => {
    mockCreate.mockResolvedValue({ id: 'notification-1' });
    mockFindAllIds.mockResolvedValue(['user-1', 'user-2']);
    mockCreateMany.mockResolvedValue(undefined);

    const emitToUser = jest.fn();
    const emit = jest.fn().mockReturnValue(true);
    const service = createNotificationService(() => ({
      emitToUser,
      getIO: () => ({ emit }),
    }));

    await service.notifyUser('user-1', 'NEW_EXAM', 'Title', 'Message', examMetadata);
    await service.notifyAllUsers('NEW_EXAM', 'Title', 'Message', examMetadata);

    expect(emitToUser).toHaveBeenCalledWith('user-1', 'notification_new', {
      id: 'notification-1',
    });
    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

