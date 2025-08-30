import { Injectable } from '@nestjs/common';
import { Repository, DataSource, SelectQueryBuilder, In } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ItemClaim } from '../entities/item-claim.entity';
import { ClaimStatus } from '../../common/enums/claim-status.enum';

export interface ClaimQueueInfo {
  totalClaims: number;
  activeClaims: number;
  userPosition: number | null;
  estimatedWait: number; // in queue positions
  nextClaim: ItemClaim | null;
}

@Injectable()
export class ItemClaimsRepository extends Repository<ItemClaim> {
  constructor(
    @InjectDataSource() dataSource: DataSource,
  ) {
    super(ItemClaim, dataSource.createEntityManager());
  }

  /**
   * Get FIFO queue information for an item
   */
  async getQueueInfo(itemId: number, userId?: number): Promise<ClaimQueueInfo> {
    const totalClaims = await this.count({
      where: { itemId },
    });

    const activeClaims = await this.count({
      where: { 
        itemId,
        status: In(['pending', 'contacted']),
      },
    });

    let userPosition: number | null = null;
    if (userId) {
      const userClaim = await this.findOne({
        where: { 
          itemId, 
          userId,
          status: In(['pending', 'contacted']),
        },
      });
      userPosition = userClaim?.queuePosition || null;
    }

    const nextClaim = await this.findOne({
      where: { 
        itemId,
        status: In(['pending', 'contacted']),
      },
      order: { queuePosition: 'ASC' },
      relations: ['user'],
    });

    return {
      totalClaims,
      activeClaims,
      userPosition,
      estimatedWait: userPosition ? userPosition - 1 : 0,
      nextClaim,
    };
  }

  /**
   * Get ordered queue for an item (FIFO)
   */
  async getQueueForItem(
    itemId: number,
    includeInactive = false,
  ): Promise<ItemClaim[]> {
    const queryBuilder = this.createQueryBuilder('claim')
      .leftJoinAndSelect('claim.user', 'user')
      .where('claim.item_id = :itemId', { itemId });

    if (!includeInactive) {
      queryBuilder.andWhere('claim.status IN (:...activeStatuses)', {
        activeStatuses: ['pending', 'contacted'],
      });
    }

    return queryBuilder
      .orderBy('claim.queue_position', 'ASC')
      .addOrderBy('claim.created_at', 'ASC')
      .getMany();
  }

  /**
   * Get next claim in queue for an item
   */
  async getNextInQueue(itemId: number): Promise<ItemClaim | null> {
    return this.findOne({
      where: { 
        itemId,
        status: In(['pending', 'contacted']),
      },
      order: { 
        queuePosition: 'ASC',
        createdAt: 'ASC',
      },
      relations: ['user', 'item'],
    });
  }

  /**
   * Find user's claims across all items
   */
  async findUserClaims(
    userId: number,
    status?: ClaimStatus[],
    limit = 20,
  ): Promise<ItemClaim[]> {
    const queryBuilder = this.createQueryBuilder('claim')
      .leftJoinAndSelect('claim.item', 'item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.images', 'images')
      .where('claim.user_id = :userId', { userId });

    if (status && status.length > 0) {
      queryBuilder.andWhere('claim.status IN (:...status)', { status });
    }

    return queryBuilder
      .orderBy('claim.updated_at', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Find active claims for user (pending or contacted)
   */
  async findActiveClaims(userId: number): Promise<ItemClaim[]> {
    return this.find({
      where: { 
        userId,
        status: In(['pending', 'contacted']),
      },
      relations: ['item', 'item.category', 'item.images'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Check if user has already claimed an item
   */
  async hasUserClaimedItem(itemId: number, userId: number): Promise<boolean> {
    const existingClaim = await this.findOne({
      where: { 
        itemId, 
        userId,
        status: In(['pending', 'contacted', 'selected']),
      },
    });

    return !!existingClaim;
  }

  /**
   * Create new claim and add to FIFO queue
   */
  async createClaim(
    itemId: number,
    userId: number,
    claimData: Partial<ItemClaim>,
  ): Promise<ItemClaim> {
    // Check if user already has active claim
    const existingClaim = await this.hasUserClaimedItem(itemId, userId);
    if (existingClaim) {
      throw new Error('User already has an active claim for this item');
    }

    // Create the claim - queue position will be set by database trigger
    const claim = this.create({
      itemId,
      userId,
      ...claimData,
      status: ClaimStatus.PENDING,
    });

    return this.save(claim);
  }

  /**
   * Move claim to specific position in queue
   */
  async moveToPosition(claimId: number, newPosition: number): Promise<void> {
    await this.manager.transaction(async (manager) => {
      const claim = await manager.findOne(ItemClaim, { 
        where: { id: claimId },
      });

      if (!claim) {
        throw new Error('Claim not found');
      }

      const oldPosition = claim.queuePosition;

      // If moving forward in queue (lower position number)
      if (newPosition < oldPosition) {
        await manager
          .createQueryBuilder()
          .update(ItemClaim)
          .set({ queuePosition: () => 'queue_position + 1' })
          .where('item_id = :itemId', { itemId: claim.itemId })
          .andWhere('queue_position >= :newPosition', { newPosition })
          .andWhere('queue_position < :oldPosition', { oldPosition })
          .andWhere('status IN (:...activeStatuses)', {
            activeStatuses: ['pending', 'contacted'],
          })
          .execute();
      } 
      // If moving backward in queue (higher position number)
      else if (newPosition > oldPosition) {
        await manager
          .createQueryBuilder()
          .update(ItemClaim)
          .set({ queuePosition: () => 'queue_position - 1' })
          .where('item_id = :itemId', { itemId: claim.itemId })
          .andWhere('queue_position > :oldPosition', { oldPosition })
          .andWhere('queue_position <= :newPosition', { newPosition })
          .andWhere('status IN (:...activeStatuses)', {
            activeStatuses: ['pending', 'contacted'],
          })
          .execute();
      }

      // Update the moved claim's position
      await manager.update(ItemClaim, claimId, { queuePosition: newPosition });
    });
  }

  /**
   * Remove claim from queue and reorder remaining claims
   */
  async removeClaim(claimId: number, reason: string, status: ClaimStatus): Promise<void> {
    await this.manager.transaction(async (manager) => {
      const claim = await manager.findOne(ItemClaim, { 
        where: { id: claimId },
      });

      if (!claim) {
        throw new Error('Claim not found');
      }

      // Update claim status
      const updateData: Partial<ItemClaim> = {
        status,
        updatedAt: new Date(),
      };

      if (status === ClaimStatus.CANCELLED) {
        updateData.cancelledAt = new Date();
        updateData.cancellationReason = reason;
      } else if (status === ClaimStatus.SKIPPED) {
        updateData.skippedAt = new Date();
        updateData.skipReason = reason;
      } else if (status === ClaimStatus.COMPLETED) {
        updateData.completedAt = new Date();
      }

      await manager.update(ItemClaim, claimId, updateData);

      // Reorder queue - this will be handled by database trigger
      // but we can also do it explicitly here for immediate consistency
      await manager
        .createQueryBuilder()
        .update(ItemClaim)
        .set({ queuePosition: () => 'queue_position - 1' })
        .where('item_id = :itemId', { itemId: claim.itemId })
        .andWhere('queue_position > :position', { position: claim.queuePosition })
        .andWhere('status IN (:...activeStatuses)', {
          activeStatuses: ['pending', 'contacted'],
        })
        .execute();
    });
  }

  /**
   * Get claims that have been waiting too long (for notifications)
   */
  async getStaleClains(hoursOld = 48): Promise<ItemClaim[]> {
    const cutoffDate = new Date(Date.now() - hoursOld * 60 * 60 * 1000);

    return this.createQueryBuilder('claim')
      .leftJoinAndSelect('claim.user', 'user')
      .leftJoinAndSelect('claim.item', 'item')
      .where('claim.status = :status', { status: ClaimStatus.PENDING })
      .andWhere('claim.created_at < :cutoffDate', { cutoffDate })
      .andWhere('claim.queue_position = 1') // Only notify users who are next
      .getMany();
  }

  /**
   * Get claims by lister for management
   */
  async getClaimsForLister(
    listerUserId: number,
    itemId?: number,
    status?: ClaimStatus[],
  ): Promise<ItemClaim[]> {
    const queryBuilder = this.createQueryBuilder('claim')
      .leftJoinAndSelect('claim.user', 'user')
      .leftJoinAndSelect('claim.item', 'item')
      .where('item.user_id = :listerUserId', { listerUserId });

    if (itemId) {
      queryBuilder.andWhere('claim.item_id = :itemId', { itemId });
    }

    if (status && status.length > 0) {
      queryBuilder.andWhere('claim.status IN (:...status)', { status });
    }

    return queryBuilder
      .orderBy('claim.queue_position', 'ASC')
      .addOrderBy('claim.created_at', 'ASC')
      .getMany();
  }

  /**
   * Get queue statistics for an item
   */
  async getQueueStatistics(itemId: number): Promise<{
    totalClaims: number;
    activeClaims: number;
    completedClaims: number;
    cancelledClaims: number;
    averageWaitTime: number; // in hours
  }> {
    const stats = await this.createQueryBuilder('claim')
      .select([
        'COUNT(*) as total_claims',
        `COUNT(CASE WHEN status IN ('pending', 'contacted') THEN 1 END) as active_claims`,
        `COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_claims`,
        `COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_claims`,
        `AVG(CASE WHEN completed_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600 
          END) as average_wait_time`,
      ])
      .where('item_id = :itemId', { itemId })
      .getRawOne();

    return {
      totalClaims: parseInt(stats.total_claims) || 0,
      activeClaims: parseInt(stats.active_claims) || 0,
      completedClaims: parseInt(stats.completed_claims) || 0,
      cancelledClaims: parseInt(stats.cancelled_claims) || 0,
      averageWaitTime: parseFloat(stats.average_wait_time) || 0,
    };
  }
}