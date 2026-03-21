import {
  NotificationService,
  createNotificationService,
} from '../../../apps/api/src/services/notification.service';
import { resetWebSocketServiceForTesting } from '../../../apps/api/src/services/websocket.service';
import { NotificationRepository } from '../../../apps/api/src/repositories/notification.repository';
import { UserRepository } from '../../../apps/api/src/repositories/user.repository';

describe('notification service factories', () => {
  const examMetadata = {
    examId: '11111111-1111-4111-8111-111111111111',
    link: '/exams/11111111-1111-4111-8111-111111111111',
  };

  afterEach(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    await resetWebSocketServiceForTesting();
  });

  it('creates a notification service without requiring initialized websocket state', () => {
    const service = createNotificationService();

    expect(service).toBeInstanceOf(NotificationService);
    expect((service as any).notificationRepository).toBeInstanceOf(NotificationRepository);
    expect((service as any).userRepository).toBeInstanceOf(UserRepository);
  });

  it('skips socket emits when the websocket provider returns null', async () => {
    const notificationRepository = {
      create: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    } as any;
    const userRepository = {} as any;
    const service = new NotificationService({
      notificationRepository,
      userRepository,
      getSocketService: () => null,
    });

    const created = await service.notifyUser(
      'user-1',
      'NEW_EXAM',
      'Title',
      'Message',
      examMetadata,
    );

    expect(created).toEqual({ id: 'notification-1' });
    expect(notificationRepository.create).toHaveBeenCalledTimes(1);
  });

  it('emits through the provided websocket notifier when available', async () => {
    const notificationRepository = {
      create: jest.fn().mockResolvedValue({ id: 'notification-1' }),
      createMany: jest.fn().mockResolvedValue(undefined),
    } as any;
    const userRepository = {
      findAllIds: jest.fn().mockResolvedValue(['user-1', 'user-2']),
    } as any;
    const emitToUser = jest.fn();
    const emit = jest.fn().mockReturnValue(true);
    const service = new NotificationService({
      notificationRepository,
      userRepository,
      getSocketService: () => ({
        emitToUser,
        getIO: () => ({ emit }),
      }),
    });

    await service.notifyUser('user-1', 'NEW_EXAM', 'Title', 'Message', examMetadata);
    await service.notifyAllUsers('NEW_EXAM', 'Title', 'Message', examMetadata);

    expect(emitToUser).toHaveBeenCalledWith('user-1', 'notification_new', {
      id: 'notification-1',
    });
    expect(notificationRepository.createMany).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
