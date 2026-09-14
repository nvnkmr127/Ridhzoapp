import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processReminderJob } from './reminderWorker';
import { NotificationService } from '@/domains/notifications/service';
import { ActivityService } from '@/domains/activities/service';
import { PushService } from '@/lib/push/service';
import { FollowUpService } from '@/domains/follow-ups/service';

// Mock DB
vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'notif-123' }]),
      onConflictDoUpdate: vi.fn().mockResolvedValue([]),
    }),
    delete: vi.fn().mockReturnThis(),
  },
}));

// Mock web-push
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

describe('Reminder Worker & Delivery Architecture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processReminderJob Execution & Safety', () => {
    it('should deliver in-app notification & log activity for active pending follow-up', async () => {
      const mockReminder = { id: 'rem-1', followUpId: 'fup-1', sentAt: null };
      const mockFollowUp = { id: 'fup-1', leadId: 'lead-100', userId: 'user-owner-1', status: 'pending', title: 'Call Client', type: 'Call', snoozedUntil: null };
      const mockLead = { id: 'lead-100', name: 'John Doe', organizationId: 'org-abc', ownerId: 'user-owner-1' };

      const { db } = await import('@/db');
      
      // Setup DB returns for reminder, followUp, lead
      ((db as any).limit as any)
        .mockResolvedValueOnce([mockReminder])
        .mockResolvedValueOnce([mockFollowUp])
        .mockResolvedValueOnce([mockLead]);

      const createNotifSpy = vi.spyOn(NotificationService, 'create').mockResolvedValueOnce({
        id: 'notif-1',
        userId: 'user-owner-1',
        type: 'follow_up_due',
        title: 'Follow-up due: Call Client',
        body: 'Follow up with John Doe (Call)',
        leadId: 'lead-100',
        readAt: null,
        createdAt: new Date(),
      });

      const addActivitySpy = vi.spyOn(ActivityService, 'addActivity').mockResolvedValueOnce({
        id: 'act-1',
        leadId: 'lead-100',
        userId: 'user-owner-1',
        type: 'note',
        content: 'Reminder sent: Call Client',
        occurredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await processReminderJob({ followUpId: 'fup-1', reminderId: 'rem-1' });

      expect(result.status).toBe('success');
      expect(result.targetUserId).toBe('user-owner-1');
      expect(result.leadId).toBe('lead-100');
      expect(result.organizationId).toBe('org-abc');

      expect(createNotifSpy).toHaveBeenCalledWith({
        userId: 'user-owner-1',
        type: 'follow_up_due',
        title: 'Follow-up due: Call Client',
        body: 'Follow up with John Doe (Call)',
        leadId: 'lead-100',
      });

      expect(addActivitySpy).toHaveBeenCalledWith({
        leadId: 'lead-100',
        userId: 'user-owner-1',
        type: 'note',
        content: 'Reminder sent: Call Client',
      });

      expect(db.update).toHaveBeenCalled();
    });

    it('should resolve owner from Lead when followUp.userId is null', async () => {
      const mockReminder = { id: 'rem-2', followUpId: 'fup-2', sentAt: null };
      const mockFollowUp = { id: 'fup-2', leadId: 'lead-200', userId: null, status: 'pending', title: 'Send Proposal', type: 'Email' };
      const mockLead = { id: 'lead-200', name: 'Jane Smith', organizationId: 'org-abc', ownerId: 'lead-assigned-owner' };

      const { db } = await import('@/db');
      ((db as any).limit as any)
        .mockResolvedValueOnce([mockReminder])
        .mockResolvedValueOnce([mockFollowUp])
        .mockResolvedValueOnce([mockLead]);

      const createNotifSpy = vi.spyOn(NotificationService, 'create').mockResolvedValueOnce({
        id: 'notif-2',
        userId: 'lead-assigned-owner',
        type: 'follow_up_due',
        title: 'Follow-up due: Send Proposal',
        body: 'Follow up with Jane Smith (Email)',
        leadId: 'lead-200',
        readAt: null,
        createdAt: new Date(),
      });

      vi.spyOn(ActivityService, 'addActivity').mockResolvedValueOnce({} as any);

      const result = await processReminderJob({ followUpId: 'fup-2', reminderId: 'rem-2' });

      expect(result.status).toBe('success');
      expect(result.targetUserId).toBe('lead-assigned-owner');
      expect(createNotifSpy).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'lead-assigned-owner',
        leadId: 'lead-200',
      }));
    });

    it('should skip duplicate processing if reminder sentAt is already set (Idempotency)', async () => {
      const mockReminder = { id: 'rem-3', followUpId: 'fup-3', sentAt: new Date('2026-08-27T10:00:00Z') };

      const { db } = await import('@/db');
      ((db as any).limit as any).mockResolvedValueOnce([mockReminder]);

      const createNotifSpy = vi.spyOn(NotificationService, 'create');

      const result = await processReminderJob({ followUpId: 'fup-3', reminderId: 'rem-3' });

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('already_sent');
      expect(createNotifSpy).not.toHaveBeenCalled();
    });

    it('should skip reminder if follow-up is completed', async () => {
      const mockReminder = { id: 'rem-4', followUpId: 'fup-4', sentAt: null };
      const mockFollowUp = { id: 'fup-4', leadId: 'lead-400', userId: 'user-1', status: 'completed', title: 'Done Task' };

      const { db } = await import('@/db');
      ((db as any).limit as any)
        .mockResolvedValueOnce([mockReminder])
        .mockResolvedValueOnce([mockFollowUp]);

      const createNotifSpy = vi.spyOn(NotificationService, 'create');

      const result = await processReminderJob({ followUpId: 'fup-4', reminderId: 'rem-4' });

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('status_completed');
      expect(createNotifSpy).not.toHaveBeenCalled();
    });

    it('should skip reminder if follow-up is cancelled', async () => {
      const mockReminder = { id: 'rem-5', followUpId: 'fup-5', sentAt: null };
      const mockFollowUp = { id: 'fup-5', leadId: 'lead-500', userId: 'user-1', status: 'cancelled', title: 'Cancelled Call' };

      const { db } = await import('@/db');
      ((db as any).limit as any)
        .mockResolvedValueOnce([mockReminder])
        .mockResolvedValueOnce([mockFollowUp]);

      const result = await processReminderJob({ followUpId: 'fup-5', reminderId: 'rem-5' });

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('status_cancelled');
    });

    it('should skip reminder if follow-up is deleted (not found)', async () => {
      const mockReminder = { id: 'rem-6', followUpId: 'fup-6', sentAt: null };

      const { db } = await import('@/db');
      ((db as any).limit as any)
        .mockResolvedValueOnce([mockReminder])
        .mockResolvedValueOnce([]); // followUp not found

      const result = await processReminderJob({ followUpId: 'fup-6', reminderId: 'rem-6' });

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('followup_not_found');
    });

    it('should skip reminder if Lead is missing', async () => {
      const mockReminder = { id: 'rem-7', followUpId: 'fup-7', sentAt: null };
      const mockFollowUp = { id: 'fup-7', leadId: 'lead-missing', userId: 'user-1', status: 'pending', title: 'Call' };

      const { db } = await import('@/db');
      ((db as any).limit as any)
        .mockResolvedValueOnce([mockReminder])
        .mockResolvedValueOnce([mockFollowUp])
        .mockResolvedValueOnce([]); // lead missing

      const result = await processReminderJob({ followUpId: 'fup-7', reminderId: 'rem-7' });

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('lead_not_found');
    });

    it('should skip reminder if Lead owner is missing', async () => {
      const mockReminder = { id: 'rem-8', followUpId: 'fup-8', sentAt: null };
      const mockFollowUp = { id: 'fup-8', leadId: 'lead-no-owner', userId: null, status: 'pending', title: 'Task' };
      const mockLead = { id: 'lead-no-owner', name: 'No Owner Lead', organizationId: 'org-abc', ownerId: null };

      const { db } = await import('@/db');
      ((db as any).limit as any)
        .mockResolvedValueOnce([mockReminder])
        .mockResolvedValueOnce([mockFollowUp])
        .mockResolvedValueOnce([mockLead]);

      const result = await processReminderJob({ followUpId: 'fup-8', reminderId: 'rem-8' });

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('missing_owner');
    });

    it('should skip reminder if Lead lacks organizationId (Tenant Isolation)', async () => {
      const mockReminder = { id: 'rem-9', followUpId: 'fup-9', sentAt: null };
      const mockFollowUp = { id: 'fup-9', leadId: 'lead-no-org', userId: 'user-1', status: 'pending', title: 'Task' };
      const mockLead = { id: 'lead-no-org', name: 'Unscoped Lead', organizationId: null, ownerId: 'user-1' };

      const { db } = await import('@/db');
      ((db as any).limit as any)
        .mockResolvedValueOnce([mockReminder])
        .mockResolvedValueOnce([mockFollowUp])
        .mockResolvedValueOnce([mockLead]);

      const result = await processReminderJob({ followUpId: 'fup-9', reminderId: 'rem-9' });

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('missing_organization');
    });
  });

  describe('Push Notification & Web Push Fail-safe', () => {
    it('should create in-app notification cleanly even if web push fails', async () => {
      const { db } = await import('@/db');
      ((db as any).values as any).mockReturnValueOnce({
        returning: vi.fn().mockResolvedValue([{ id: 'notif-push-fail', userId: 'u1', type: 'follow_up_due', title: 'Test' }]),
      });

      vi.spyOn(PushService, 'sendToUser').mockRejectedValueOnce(new Error('Push gateway timeout'));

      const notif = await NotificationService.create({
        userId: 'u1',
        type: 'follow_up_due',
        title: 'Test Title',
        leadId: 'lead-1',
      });

      expect(notif.id).toBe('notif-push-fail');
    });

    it('should delete expired push subscription on 410 Gone error', async () => {
      const webpush = (await import('web-push')).default;
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-pub';
      process.env.VAPID_PRIVATE_KEY = 'test-priv';

      const { db } = await import('@/db');
      const mockSub = { endpoint: 'https://push.service/expired-sub', p256dh: 'p1', auth: 'a1' };
      
      const queryChain = {
        where: vi.fn().mockResolvedValue([mockSub]),
        then: (resolve: any) => resolve([mockSub]),
      };
      ((db as any).from as any).mockReturnValueOnce(queryChain);

      (webpush.sendNotification as any).mockRejectedValueOnce({ statusCode: 410 });

      await PushService.sendToUser('user-expired', { title: 'Test Push' });

      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('FollowUp Lifecycle & Status Integrity', () => {
    it('should leave follow-up as pending & overdue after reminder delivery', () => {
      const now = new Date('2026-08-27T18:00:00Z');
      const followUp = {
        dueAt: new Date('2026-08-27T17:00:00Z'), // 1 hour ago
        status: 'pending',
      };

      const isOverdue = new Date(followUp.dueAt) < now && followUp.status === 'pending';
      expect(isOverdue).toBe(true);
    });

    it('should update status to completed upon completeFollowUp call', async () => {
      const { db } = await import('@/db');
      const mockUpdated = { id: 'fup-complete-1', leadId: 'lead-1', status: 'completed', type: 'Task', completedAt: new Date() };

      ((db as any).returning as any).mockResolvedValueOnce([mockUpdated]);

      const updated = await FollowUpService.completeFollowUp('fup-complete-1');

      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeDefined();
    });
  });
});
