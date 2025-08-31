import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ItemClaimsService } from './item-claims.service';
import { ItemsService } from './items.service';
import { ItemClaim } from '../entities/item-claim.entity';
import { Item } from '../entities/item.entity';
import { ClaimStatus } from '../../common/enums/claim-status.enum';

export interface NotificationEvent {
  type: 'claim_created' | 'claim_cancelled' | 'claim_selected' | 'claim_completed' | 'claim_expired' | 'position_changed';
  itemId: number;
  userId: number;
  claimId?: number;
  data?: Record<string, any>;
  timestamp: Date;
}

export interface QueuePositionUpdate {
  claimId: number;
  userId: number;
  itemId: number;
  oldPosition: number;
  newPosition: number;
  estimatedWait: number;
}

export interface NotificationTemplate {
  type: string;
  subject: string;
  body: string;
  channels: ('email' | 'sms' | 'push' | 'in_app')[];
}

@Injectable()
export class ItemNotificationsService {
  private readonly logger = new Logger(ItemNotificationsService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly itemClaimsService: ItemClaimsService,
    private readonly itemsService: ItemsService,
  ) {}

  /**
   * Send notification when new claim is created
   */
  @OnEvent('claim.created')
  async handleClaimCreated(event: { claim: ItemClaim; item: Item }): Promise<void> {
    this.logger.log(`Processing claim created event for claim ${event.claim.id}`);

    try {
      // Notify lister about new claim
      await this.notifyLister({
        type: 'new_claim',
        itemId: event.item.id,
        claimId: event.claim.id,
        listerUserId: event.item.userId,
        data: {
          itemTitle: event.item.title,
          claimerPosition: event.claim.queuePosition,
          totalClaims: await this.getTotalActiveClaims(event.item.id),
        },
      });

      // Update queue positions for existing claimers if needed
      await this.notifyQueuePositionUpdates(event.item.id);

    } catch (error) {
      this.logger.error(`Failed to handle claim created event:`, error);
    }
  }

  /**
   * Send notification when claim is cancelled
   */
  @OnEvent('claim.cancelled')
  async handleClaimCancelled(event: { claim: ItemClaim; item: Item; reason: string }): Promise<void> {
    this.logger.log(`Processing claim cancelled event for claim ${event.claim.id}`);

    try {
      // Notify lister about cancellation
      await this.notifyLister({
        type: 'claim_cancelled',
        itemId: event.item.id,
        claimId: event.claim.id,
        listerUserId: event.item.userId,
        data: {
          itemTitle: event.item.title,
          reason: event.reason,
          remainingClaims: await this.getTotalActiveClaims(event.item.id),
        },
      });

      // Notify queue about position updates (people moved up)
      await this.notifyQueuePositionUpdates(event.item.id);

      // Notify next person in queue if they exist
      const nextClaim = await this.itemClaimsService.getNextInQueue(event.item.id);
      if (nextClaim) {
        await this.notifyClaimerAdvanced(nextClaim, event.item);
      }

    } catch (error) {
      this.logger.error(`Failed to handle claim cancelled event:`, error);
    }
  }

  /**
   * Send notification when claim is selected
   */
  @OnEvent('claim.selected')
  async handleClaimSelected(event: { claim: ItemClaim; item: Item }): Promise<void> {
    this.logger.log(`Processing claim selected event for claim ${event.claim.id}`);

    try {
      // Notify selected claimer
      await this.notifyClaimerSelected(event.claim, event.item);

      // Notify other claimers that item has been claimed
      await this.notifyOtherClaimersItemClaimed(event.item.id, event.claim.userId);

    } catch (error) {
      this.logger.error(`Failed to handle claim selected event:`, error);
    }
  }

  /**
   * Send notification when claim is completed
   */
  @OnEvent('claim.completed')
  async handleClaimCompleted(event: { claim: ItemClaim; item: Item }): Promise<void> {
    this.logger.log(`Processing claim completed event for claim ${event.claim.id}`);

    try {
      // Notify lister about successful completion
      await this.notifyLister({
        type: 'claim_completed',
        itemId: event.item.id,
        claimId: event.claim.id,
        listerUserId: event.item.userId,
        data: {
          itemTitle: event.item.title,
          completedAt: new Date(),
        },
      });

      // Send completion confirmation to claimer
      await this.notifyClaimerCompletion(event.claim, event.item);

    } catch (error) {
      this.logger.error(`Failed to handle claim completed event:`, error);
    }
  }

  /**
   * Send notification when claims expire
   */
  @OnEvent('claim.expired')
  async handleClaimExpired(event: { claim: ItemClaim; item: Item }): Promise<void> {
    this.logger.log(`Processing claim expired event for claim ${event.claim.id}`);

    try {
      // Notify lister about expired claim
      await this.notifyLister({
        type: 'claim_expired',
        itemId: event.item.id,
        claimId: event.claim.id,
        listerUserId: event.item.userId,
        data: {
          itemTitle: event.item.title,
          expiredAt: new Date(),
        },
      });

      // Notify queue about position updates
      await this.notifyQueuePositionUpdates(event.item.id);

      // Notify next person in queue
      const nextClaim = await this.itemClaimsService.getNextInQueue(event.item.id);
      if (nextClaim) {
        await this.notifyClaimerAdvanced(nextClaim, event.item);
      }

    } catch (error) {
      this.logger.error(`Failed to handle claim expired event:`, error);
    }
  }

  /**
   * Manually trigger notification for next person in queue
   */
  async notifyNextInQueue(itemId: number): Promise<boolean> {
    try {
      const nextClaim = await this.itemClaimsService.getNextInQueue(itemId);
      if (!nextClaim) {
        this.logger.debug(`No next claim found for item ${itemId}`);
        return false;
      }

      const item = await this.itemsService.findOne(itemId);
      if (!item) {
        this.logger.warn(`Item ${itemId} not found for notification`);
        return false;
      }

      await this.notifyClaimerAdvanced(nextClaim, item);
      return true;

    } catch (error) {
      this.logger.error(`Failed to notify next in queue for item ${itemId}:`, error);
      return false;
    }
  }

  /**
   * Send daily digest notifications
   */
  async sendDailyDigest(): Promise<void> {
    this.logger.log('Sending daily digest notifications');

    try {
      // Get all users with active claims
      const activeClaimsUsers = await this.getActiveClaimsUsers();

      for (const userId of activeClaimsUsers) {
        await this.sendUserDailyDigest(userId);
      }

      // Send lister digest for those with active items
      const activeItemListers = await this.getActiveItemListers();
      
      for (const userId of activeItemListers) {
        await this.sendListerDailyDigest(userId);
      }

    } catch (error) {
      this.logger.error('Failed to send daily digest notifications:', error);
    }
  }

  /**
   * Send reminder notifications for stale claims
   */
  async sendStaleClaimReminders(): Promise<number> {
    this.logger.log('Sending stale claim reminder notifications');

    let sentCount = 0;

    try {
      // Get claims that have been contacted but no response for 24+ hours
      const staleClaims = await this.itemClaimsService.getClaimsNeedingAttention();

      for (const claim of staleClaims) {
        await this.sendStaleClaimReminder(claim);
        sentCount++;
      }

    } catch (error) {
      this.logger.error('Failed to send stale claim reminders:', error);
    }

    return sentCount;
  }

  // Private helper methods

  private async notifyLister(notification: {
    type: string;
    itemId: number;
    claimId?: number;
    listerUserId: number;
    data: Record<string, any>;
  }): Promise<void> {
    // In a real application, this would send actual notifications
    // via email, SMS, push notifications, etc.
    this.logger.debug(`Lister notification: ${notification.type} for item ${notification.itemId}`);
    
    // Emit event for other systems to handle
    this.eventEmitter.emit('notification.lister', notification);
  }

  private async notifyClaimerAdvanced(claim: ItemClaim, item: Item): Promise<void> {
    this.logger.debug(`Notifying claimer ${claim.userId} they advanced to position ${claim.queuePosition}`);

    const notification = {
      type: 'queue_advanced',
      userId: claim.userId,
      claimId: claim.id,
      itemId: item.id,
      data: {
        itemTitle: item.title,
        newPosition: claim.queuePosition,
        isNext: claim.queuePosition === 1,
      },
    };

    this.eventEmitter.emit('notification.claimer', notification);
  }

  private async notifyClaimerSelected(claim: ItemClaim, item: Item): Promise<void> {
    this.logger.debug(`Notifying claimer ${claim.userId} they were selected for item ${item.id}`);

    const notification = {
      type: 'claim_selected',
      userId: claim.userId,
      claimId: claim.id,
      itemId: item.id,
      data: {
        itemTitle: item.title,
        selectedAt: new Date(),
      },
    };

    this.eventEmitter.emit('notification.claimer', notification);
  }

  private async notifyClaimerCompletion(claim: ItemClaim, item: Item): Promise<void> {
    this.logger.debug(`Notifying claimer ${claim.userId} about completion of claim ${claim.id}`);

    const notification = {
      type: 'claim_completed',
      userId: claim.userId,
      claimId: claim.id,
      itemId: item.id,
      data: {
        itemTitle: item.title,
        completedAt: new Date(),
      },
    };

    this.eventEmitter.emit('notification.claimer', notification);
  }

  private async notifyOtherClaimersItemClaimed(itemId: number, selectedUserId: number): Promise<void> {
    const queue = await this.itemClaimsService.getQueue(itemId, false);
    
    for (const claim of queue) {
      if (claim.userId !== selectedUserId && claim.status === ClaimStatus.PENDING) {
        const notification = {
          type: 'item_claimed',
          userId: claim.userId,
          claimId: claim.id,
          itemId: itemId,
          data: {
            message: 'This item has been claimed by another user',
          },
        };

        this.eventEmitter.emit('notification.claimer', notification);
      }
    }
  }

  private async notifyQueuePositionUpdates(itemId: number): Promise<void> {
    const queue = await this.itemClaimsService.getQueue(itemId, false);
    
    for (let i = 0; i < queue.length; i++) {
      const claim = queue[i];
      const expectedPosition = i + 1;
      
      if (claim.queuePosition !== expectedPosition) {
        const notification = {
          type: 'position_updated',
          userId: claim.userId,
          claimId: claim.id,
          itemId: itemId,
          data: {
            oldPosition: claim.queuePosition,
            newPosition: expectedPosition,
            estimatedWait: expectedPosition - 1,
          },
        };

        this.eventEmitter.emit('notification.claimer', notification);
      }
    }
  }

  private async getTotalActiveClaims(itemId: number): Promise<number> {
    const queueInfo = await this.itemClaimsService.getQueueInfo(itemId);
    return queueInfo.activeClaims;
  }

  private async getActiveClaimsUsers(): Promise<number[]> {
    // Simplified - would need proper query in production
    const activeClaims = await this.itemClaimsService['claimsRepository'].find({
      where: { 
        status: { $in: [ClaimStatus.PENDING, ClaimStatus.CONTACTED] } 
      },
      select: ['userId'],
    } as any);

    return [...new Set(activeClaims.map(claim => claim.userId))];
  }

  private async getActiveItemListers(): Promise<number[]> {
    // Simplified - would need proper query in production
    return [];
  }

  private async sendUserDailyDigest(userId: number): Promise<void> {
    const activeClaims = await this.itemClaimsService.getActiveClaims(userId);
    
    if (activeClaims.length === 0) return;

    const digest = {
      type: 'daily_digest',
      userId,
      data: {
        activeClaims: activeClaims.length,
        claimSummary: activeClaims.map(claim => ({
          itemId: claim.itemId,
          position: claim.queuePosition,
          status: claim.status,
        })),
      },
    };

    this.eventEmitter.emit('notification.digest', digest);
  }

  private async sendListerDailyDigest(userId: number): Promise<void> {
    const claims = await this.itemClaimsService.getClaimsForLister(userId);
    
    if (claims.length === 0) return;

    const digest = {
      type: 'lister_digest',
      userId,
      data: {
        totalClaims: claims.length,
        pendingClaims: claims.filter(c => c.status === ClaimStatus.PENDING).length,
        contactedClaims: claims.filter(c => c.status === ClaimStatus.CONTACTED).length,
      },
    };

    this.eventEmitter.emit('notification.digest', digest);
  }

  private async sendStaleClaimReminder(claim: ItemClaim): Promise<void> {
    const notification = {
      type: 'stale_claim_reminder',
      userId: claim.userId,
      claimId: claim.id,
      itemId: claim.itemId,
      data: {
        contactedAt: claim.contactedAt,
        daysSinceContact: Math.floor((Date.now() - claim.contactedAt.getTime()) / (1000 * 60 * 60 * 24)),
      },
    };

    this.eventEmitter.emit('notification.reminder', notification);
  }

  /**
   * Get notification preferences for user
   */
  async getUserNotificationPreferences(userId: number): Promise<{
    email: boolean;
    sms: boolean;
    push: boolean;
    inApp: boolean;
    digestFrequency: 'daily' | 'weekly' | 'never';
  }> {
    // Simplified - would query user preferences from database
    return {
      email: true,
      sms: false,
      push: true,
      inApp: true,
      digestFrequency: 'daily',
    };
  }

  /**
   * Update notification preferences for user
   */
  async updateUserNotificationPreferences(
    userId: number,
    preferences: {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
      inApp?: boolean;
      digestFrequency?: 'daily' | 'weekly' | 'never';
    }
  ): Promise<void> {
    // Simplified - would update user preferences in database
    this.logger.log(`Updated notification preferences for user ${userId}`);
  }

  /**
   * Get notification history for user
   */
  async getUserNotificationHistory(
    userId: number,
    limit = 50
  ): Promise<Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    createdAt: Date;
  }>> {
    // Simplified - would query notification history from database
    return [];
  }

  /**
   * Mark notifications as read
   */
  async markNotificationsAsRead(userId: number, notificationIds: string[]): Promise<void> {
    // Simplified - would update notification read status in database
    this.logger.log(`Marked ${notificationIds.length} notifications as read for user ${userId}`);
  }
}