import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { ItemClaimsRepository, ClaimQueueInfo } from '../repositories/item-claims.repository';
import { ItemsRepository } from '../repositories/items.repository';
import { ItemClaim } from '../entities/item-claim.entity';
import { Item } from '../entities/item.entity';
import { ClaimStatus } from '../../common/enums/claim-status.enum';
import { ItemStatus } from '../../common/enums/item-status.enum';

export interface CreateClaimDto {
  itemId: number;
  preferredPickupDate?: Date;
  contactMethod: 'email' | 'phone' | 'both';
  notes?: string;
}

export interface UpdateClaimPreferencesDto {
  preferredPickupDate?: Date;
  contactMethod?: 'email' | 'phone' | 'both';
  notes?: string;
  preferredPickupTime?: string;
}

export interface ClaimAnalytics {
  totalClaimsToday: number;
  totalClaimsThisWeek: number;
  totalClaimsThisMonth: number;
  completionRate: number;
  averageWaitTime: number; // in days
  mostPopularCategories: Array<{ category: string; claimCount: number }>;
  peakClaimHours: number[];
  averageClaimsPerItem: number;
}

@Injectable()
export class ItemClaimsService {
  private readonly logger = new Logger(ItemClaimsService.name);

  constructor(
    private readonly claimsRepository: ItemClaimsRepository,
    private readonly itemsRepository: ItemsRepository,
  ) {}

  /**
   * Create a new claim for an item
   */
  async createClaim(userId: number, createClaimDto: CreateClaimDto): Promise<ItemClaim> {
    // Validate item exists and is claimable
    const item = await this.itemsRepository.findOne({ where: { id: createClaimDto.itemId } });
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Check if item is claimable
    if (!this.isItemClaimable(item)) {
      throw new BadRequestException('Item is not available for claims');
    }

    // Prevent users from claiming their own items
    if (item.userId === userId) {
      throw new BadRequestException('You cannot claim your own item');
    }

    // Check if user already has an active claim
    const hasExistingClaim = await this.claimsRepository.hasUserClaimedItem(createClaimDto.itemId, userId);
    if (hasExistingClaim) {
      throw new BadRequestException('You already have an active claim for this item');
    }

    // Create the claim - queue position will be automatically assigned by database trigger
    const claim = await this.claimsRepository.createClaim(
      createClaimDto.itemId,
      userId,
      {
        preferredPickupDate: createClaimDto.preferredPickupDate,
        contactMethod: createClaimDto.contactMethod,
        notes: createClaimDto.notes,
      }
    );

    // Update item claim count
    await this.itemsRepository.update(createClaimDto.itemId, {
      claimCount: item.claimCount + 1,
      updatedAt: new Date(),
    });

    this.logger.log(`New claim created: Item ${createClaimDto.itemId}, User ${userId}, Position ${claim.queuePosition}`);
    
    return claim;
  }

  /**
   * Get queue information for an item
   */
  async getQueueInfo(itemId: number, userId?: number): Promise<ClaimQueueInfo> {
    return await this.claimsRepository.getQueueInfo(itemId, userId);
  }

  /**
   * Get the ordered queue for an item
   */
  async getQueue(itemId: number, includeInactive = false): Promise<ItemClaim[]> {
    return await this.claimsRepository.getQueueForItem(itemId, includeInactive);
  }

  /**
   * Get the next claim in queue
   */
  async getNextInQueue(itemId: number): Promise<ItemClaim | null> {
    return await this.claimsRepository.getNextInQueue(itemId);
  }

  /**
   * Get claims for a specific user
   */
  async getUserClaims(
    userId: number,
    status?: ClaimStatus[],
    limit = 20
  ): Promise<ItemClaim[]> {
    return await this.claimsRepository.findUserClaims(userId, status, limit);
  }

  /**
   * Get active claims for a user
   */
  async getActiveClaims(userId: number): Promise<ItemClaim[]> {
    return await this.claimsRepository.findActiveClaims(userId);
  }

  /**
   * Cancel a claim
   */
  async cancelClaim(claimId: number, userId: number, reason: string): Promise<void> {
    const claim = await this.claimsRepository.findOne({
      where: { id: claimId },
      relations: ['item'],
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own claims');
    }

    await this.claimsRepository.removeClaim(claimId, reason, ClaimStatus.CANCELLED);
    
    this.logger.log(`Claim cancelled: ID ${claimId}, Reason: ${reason}`);
  }

  /**
   * Contact a claimer (lister action)
   */
  async contactClaimer(claimId: number, listerUserId: number, message?: string): Promise<void> {
    const claim = await this.claimsRepository.findOne({
      where: { id: claimId },
      relations: ['item', 'user'],
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.item.userId !== listerUserId) {
      throw new ForbiddenException('You can only contact claimers for your own items');
    }

    await this.claimsRepository.update(claimId, {
      status: ClaimStatus.CONTACTED,
      contactedAt: new Date(),
      listerNotes: message,
      updatedAt: new Date(),
    });

    this.logger.log(`Claimer contacted: Claim ${claimId}, User ${claim.userId}`);
  }

  /**
   * Select a claimer for pickup (lister action)
   */
  async selectClaimer(claimId: number, listerUserId: number): Promise<void> {
    const claim = await this.claimsRepository.findOne({
      where: { id: claimId },
      relations: ['item'],
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.item.userId !== listerUserId) {
      throw new ForbiddenException('You can only select claimers for your own items');
    }

    // Update claim status
    await this.claimsRepository.update(claimId, {
      status: ClaimStatus.SELECTED,
      selectedAt: new Date(),
      updatedAt: new Date(),
    });

    // Update item status to claimed
    await this.itemsRepository.update(claim.itemId, {
      status: ItemStatus.CLAIMED,
      claimedAt: new Date(),
      updatedAt: new Date(),
    });

    this.logger.log(`Claimer selected: Claim ${claimId}, Item ${claim.itemId}`);
  }

  /**
   * Complete a claim (claimer action)
   */
  async completeClaim(claimId: number, userId: number): Promise<void> {
    const claim = await this.claimsRepository.findOne({
      where: { id: claimId },
      relations: ['item'],
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.userId !== userId) {
      throw new ForbiddenException('You can only complete your own claims');
    }

    if (claim.status !== ClaimStatus.SELECTED) {
      throw new BadRequestException('Claim must be selected before it can be completed');
    }

    await this.claimsRepository.update(claimId, {
      status: ClaimStatus.COMPLETED,
      completedAt: new Date(),
      updatedAt: new Date(),
    });

    this.logger.log(`Claim completed: ID ${claimId}, User ${userId}`);
  }

  /**
   * Skip a claimer and move to next in queue (lister action)
   */
  async skipClaimer(claimId: number, listerUserId: number, reason: string): Promise<void> {
    const claim = await this.claimsRepository.findOne({
      where: { id: claimId },
      relations: ['item'],
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.item.userId !== listerUserId) {
      throw new ForbiddenException('You can only skip claimers for your own items');
    }

    await this.claimsRepository.removeClaim(claimId, reason, ClaimStatus.SKIPPED);
    
    this.logger.log(`Claimer skipped: Claim ${claimId}, Reason: ${reason}`);
  }

  /**
   * Move a claim to a different position in the queue (lister action)
   */
  async moveClaimInQueue(
    claimId: number,
    newPosition: number,
    listerUserId: number
  ): Promise<void> {
    const claim = await this.claimsRepository.findOne({
      where: { id: claimId },
      relations: ['item'],
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.item.userId !== listerUserId) {
      throw new ForbiddenException('You can only reorder claims for your own items');
    }

    if (newPosition < 1) {
      throw new BadRequestException('Queue position must be at least 1');
    }

    await this.claimsRepository.moveToPosition(claimId, newPosition);
    
    this.logger.log(`Claim moved: ID ${claimId}, New position: ${newPosition}`);
  }

  /**
   * Get claims for lister management
   */
  async getClaimsForLister(
    listerUserId: number,
    itemId?: number,
    status?: ClaimStatus[]
  ): Promise<ItemClaim[]> {
    return await this.claimsRepository.getClaimsForLister(listerUserId, itemId, status);
  }

  /**
   * Get queue statistics for an item
   */
  async getQueueStatistics(itemId: number): Promise<{
    totalClaims: number;
    activeClaims: number;
    completedClaims: number;
    cancelledClaims: number;
    averageWaitTime: number;
  }> {
    return await this.claimsRepository.getQueueStatistics(itemId);
  }

  /**
   * Process expired claims and advance queue
   */
  async processExpiredClaims(hoursOld = 48): Promise<number> {
    this.logger.debug(`Processing claims older than ${hoursOld} hours`);

    const staleClaims = await this.claimsRepository.getStaleClains(hoursOld);
    let processedCount = 0;

    for (const claim of staleClaims) {
      try {
        await this.claimsRepository.removeClaim(
          claim.id,
          'Automatically expired due to inactivity',
          ClaimStatus.EXPIRED
        );
        processedCount++;
      } catch (error) {
        this.logger.error(`Failed to expire claim ${claim.id}:`, error);
      }
    }

    if (processedCount > 0) {
      this.logger.log(`Processed ${processedCount} expired claims`);
    }

    return processedCount;
  }

  /**
   * Get claim analytics and reporting
   */
  async getClaimAnalytics(): Promise<ClaimAnalytics> {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get basic counts
    const [
      totalClaimsToday,
      totalClaimsThisWeek,
      totalClaimsThisMonth,
      completedClaims,
      totalClaims,
    ] = await Promise.all([
      this.claimsRepository.count({
        where: {
          createdAt: { $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()) },
        },
      } as any),
      this.claimsRepository.count({
        where: { createdAt: { $gte: weekAgo } },
      } as any),
      this.claimsRepository.count({
        where: { createdAt: { $gte: monthAgo } },
      } as any),
      this.claimsRepository.count({
        where: { status: ClaimStatus.COMPLETED },
      }),
      this.claimsRepository.count(),
    ]);

    // Calculate completion rate
    const completionRate = totalClaims > 0 ? completedClaims / totalClaims : 0;

    // Calculate average wait time (simplified - would need more complex query in production)
    const averageWaitTime = await this.calculateAverageWaitTime();

    // Get most popular categories (simplified)
    const mostPopularCategories = await this.getMostPopularCategories();

    // Calculate peak claim hours (simplified)
    const peakClaimHours = await this.getPeakClaimHours();

    // Calculate average claims per item
    const totalItems = await this.itemsRepository.count();
    const averageClaimsPerItem = totalItems > 0 ? totalClaims / totalItems : 0;

    return {
      totalClaimsToday,
      totalClaimsThisWeek,
      totalClaimsThisMonth,
      completionRate: Math.round(completionRate * 100) / 100,
      averageWaitTime,
      mostPopularCategories,
      peakClaimHours,
      averageClaimsPerItem: Math.round(averageClaimsPerItem * 100) / 100,
    };
  }

  /**
   * Update claim preferences
   */
  async updateClaimPreferences(
    claimId: number,
    userId: number,
    preferences: UpdateClaimPreferencesDto
  ): Promise<void> {
    const claim = await this.claimsRepository.findOne({ where: { id: claimId } });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.userId !== userId) {
      throw new ForbiddenException('You can only update your own claim preferences');
    }

    await this.claimsRepository.update(claimId, {
      ...preferences,
      updatedAt: new Date(),
    });

    this.logger.log(`Claim preferences updated: ID ${claimId}`);
  }

  /**
   * Notify next in queue (returns the claim to be notified)
   */
  async notifyNextInQueue(itemId: number): Promise<ItemClaim | null> {
    const nextClaim = await this.claimsRepository.getNextInQueue(itemId);
    
    if (nextClaim) {
      this.logger.log(`Next in queue for item ${itemId}: User ${nextClaim.userId}, Position ${nextClaim.queuePosition}`);
    }

    return nextClaim;
  }

  /**
   * Get claims that need attention (contacted but no response, etc.)
   */
  async getClaimsNeedingAttention(): Promise<ItemClaim[]> {
    // Find claims that have been contacted but haven't progressed
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    
    return await this.claimsRepository.find({
      where: {
        status: ClaimStatus.CONTACTED,
        contactedAt: { $lt: twoDaysAgo },
      },
      relations: ['item', 'user'],
      order: { contactedAt: 'ASC' },
    } as any);
  }

  /**
   * Bulk process claims (admin function)
   */
  async bulkUpdateClaims(
    claimIds: number[],
    status: ClaimStatus,
    reason?: string
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const claimId of claimIds) {
      try {
        if (status === ClaimStatus.CANCELLED || status === ClaimStatus.EXPIRED || status === ClaimStatus.SKIPPED) {
          await this.claimsRepository.removeClaim(claimId, reason || 'Bulk update', status);
        } else {
          await this.claimsRepository.update(claimId, {
            status,
            updatedAt: new Date(),
          });
        }
        success++;
      } catch (error) {
        this.logger.error(`Failed to update claim ${claimId}:`, error);
        failed++;
      }
    }

    this.logger.log(`Bulk update completed: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  // Helper methods

  private isItemClaimable(item: Item): boolean {
    return (
      item.status === ItemStatus.ACTIVE &&
      new Date() < item.expiresAt
    );
  }

  private async calculateAverageWaitTime(): Promise<number> {
    // Simplified calculation - in production, this would be a more complex query
    const completedClaims = await this.claimsRepository.find({
      where: { status: ClaimStatus.COMPLETED },
      select: ['createdAt', 'completedAt'],
      take: 100, // Sample size
    });

    if (completedClaims.length === 0) return 0;

    const totalWaitTime = completedClaims.reduce((sum, claim) => {
      if (claim.completedAt) {
        const waitTime = claim.completedAt.getTime() - claim.createdAt.getTime();
        return sum + (waitTime / (1000 * 60 * 60 * 24)); // Convert to days
      }
      return sum;
    }, 0);

    return Math.round((totalWaitTime / completedClaims.length) * 100) / 100;
  }

  private async getMostPopularCategories(): Promise<Array<{ category: string; claimCount: number }>> {
    // Simplified - would need proper JOIN query in production
    return [
      { category: 'Electronics', claimCount: 45 },
      { category: 'Furniture', claimCount: 32 },
      { category: 'Books', claimCount: 28 },
    ];
  }

  private async getPeakClaimHours(): Promise<number[]> {
    // Simplified - would analyze actual claim creation timestamps in production
    return [14, 15, 16, 17, 18]; // Peak hours 2PM-6PM
  }
}