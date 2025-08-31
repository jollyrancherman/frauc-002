import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ItemsService } from './items.service';
import { ItemImagesService } from './item-images.service';
import { ItemsRepository } from '../repositories/items.repository';
import { ItemClaimsRepository } from '../repositories/item-claims.repository';
import { ItemStatus } from '../../common/enums/item-status.enum';
import { ClaimStatus } from '../../common/enums/claim-status.enum';

export interface CleanupStatistics {
  expiredItems: number;
  staleClaims: number;
  orphanedImages: number;
  totalCleaned: number;
  processingTimeMs: number;
}

@Injectable()
export class ItemCleanupService {
  private readonly logger = new Logger(ItemCleanupService.name);

  constructor(
    private readonly itemsService: ItemsService,
    private readonly itemImagesService: ItemImagesService,
    private readonly itemsRepository: ItemsRepository,
    private readonly itemClaimsRepository: ItemClaimsRepository,
  ) {}

  /**
   * Run comprehensive cleanup - scheduled to run daily at 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runScheduledCleanup(): Promise<CleanupStatistics> {
    this.logger.log('Starting scheduled item cleanup process');
    const startTime = Date.now();

    try {
      const stats = await this.performCleanup();
      const processingTime = Date.now() - startTime;
      
      this.logger.log(
        `Cleanup completed: ${stats.expiredItems} expired items, ` +
        `${stats.staleClaims} stale claims, ${stats.orphanedImages} orphaned images ` +
        `(${processingTime}ms)`
      );

      return { ...stats, processingTimeMs: processingTime };
    } catch (error) {
      this.logger.error('Cleanup process failed:', error);
      throw error;
    }
  }

  /**
   * Run cleanup manually
   */
  async runManualCleanup(): Promise<CleanupStatistics> {
    this.logger.log('Starting manual cleanup process');
    return await this.performCleanup();
  }

  /**
   * Perform the actual cleanup operations
   */
  private async performCleanup(): Promise<Omit<CleanupStatistics, 'processingTimeMs'>> {
    const stats = {
      expiredItems: 0,
      staleClaims: 0,
      orphanedImages: 0,
      totalCleaned: 0,
    };

    // 1. Mark expired items
    stats.expiredItems = await this.markExpiredItems();

    // 2. Clean up stale claims
    stats.staleClaims = await this.cleanupStaleClaims();

    // 3. Clean up orphaned images (optional - be careful with this)
    // stats.orphanedImages = await this.cleanupOrphanedImages();

    stats.totalCleaned = stats.expiredItems + stats.staleClaims + stats.orphanedImages;

    return stats;
  }

  /**
   * Mark items as expired based on their expiration date
   */
  async markExpiredItems(): Promise<number> {
    this.logger.debug('Marking expired items');
    
    try {
      const expiredCount = await this.itemsRepository.markExpiredItems();
      
      if (expiredCount > 0) {
        this.logger.log(`Marked ${expiredCount} items as expired`);
        
        // Log some details about expired items for monitoring
        const expiredItems = await this.itemsRepository.find({
          where: { status: ItemStatus.EXPIRED },
          select: ['id', 'title', 'userId', 'expiresAt'],
          order: { expiredAt: 'DESC' },
          take: 10, // Just log the first 10 for monitoring
        });

        expiredItems.forEach(item => {
          this.logger.debug(`Expired item: ID=${item.id}, Title="${item.title}", User=${item.userId}`);
        });
      }

      return expiredCount;
    } catch (error) {
      this.logger.error('Failed to mark expired items:', error);
      return 0;
    }
  }

  /**
   * Clean up stale claims (claims that have been pending too long)
   */
  async cleanupStaleClaims(): Promise<number> {
    this.logger.debug('Cleaning up stale claims');
    
    try {
      // Find claims that have been pending for more than 48 hours
      const staleClaims = await this.itemClaimsRepository.getStaleClains(48);
      
      let cleanedCount = 0;
      
      for (const claim of staleClaims) {
        try {
          await this.itemClaimsRepository.removeClaim(
            claim.id,
            'Automatically expired due to inactivity',
            ClaimStatus.EXPIRED
          );
          cleanedCount++;
          
          this.logger.debug(
            `Expired stale claim: ID=${claim.id}, Item=${claim.itemId}, User=${claim.userId}`
          );
        } catch (error) {
          this.logger.warn(`Failed to expire claim ${claim.id}:`, error);
        }
      }

      if (cleanedCount > 0) {
        this.logger.log(`Expired ${cleanedCount} stale claims`);
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup stale claims:', error);
      return 0;
    }
  }

  /**
   * Clean up orphaned images (images without valid items)
   * WARNING: This is destructive and should be used carefully
   */
  async cleanupOrphanedImages(): Promise<number> {
    this.logger.debug('Cleaning up orphaned images');
    
    try {
      // Find images where the associated item no longer exists or is deleted
      const orphanedImages = await this.itemImagesService['imageRepository']
        .createQueryBuilder('image')
        .leftJoin('image.item', 'item')
        .where('item.id IS NULL OR item.status = :deletedStatus', { 
          deletedStatus: ItemStatus.DELETED 
        })
        .andWhere('image.created_at < :cutoffDate', {
          cutoffDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days old
        })
        .getMany();

      let cleanedCount = 0;

      for (const image of orphanedImages) {
        try {
          // This will delete both from S3 and database
          await this.itemImagesService['deleteFromS3'](`items/${image.itemId}/${image.filename}`);
          if (image.thumbnailUrl) {
            await this.itemImagesService['deleteFromS3'](`items/${image.itemId}/thumbnails/${image.filename}`);
          }
          
          await this.itemImagesService['imageRepository'].delete(image.id);
          cleanedCount++;
          
          this.logger.debug(`Deleted orphaned image: ID=${image.id}, File=${image.filename}`);
        } catch (error) {
          this.logger.warn(`Failed to delete orphaned image ${image.id}:`, error);
        }
      }

      if (cleanedCount > 0) {
        this.logger.log(`Cleaned up ${cleanedCount} orphaned images`);
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup orphaned images:', error);
      return 0;
    }
  }

  /**
   * Get cleanup statistics without performing cleanup
   */
  async getCleanupPreview(): Promise<{
    expiredItemsCount: number;
    staleClaimsCount: number;
    orphanedImagesCount: number;
  }> {
    const [expiredItems, staleClaims, orphanedImages] = await Promise.all([
      this.itemsRepository.findExpiredItems(1000), // Get up to 1000 for counting
      this.itemClaimsRepository.getStaleClains(48),
      this.itemImagesService['imageRepository']
        .createQueryBuilder('image')
        .leftJoin('image.item', 'item')
        .where('item.id IS NULL OR item.status = :deletedStatus', { 
          deletedStatus: ItemStatus.DELETED 
        })
        .andWhere('image.created_at < :cutoffDate', {
          cutoffDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        })
        .getCount()
    ]);

    return {
      expiredItemsCount: expiredItems.length,
      staleClaimsCount: staleClaims.length,
      orphanedImagesCount: orphanedImages,
    };
  }

  /**
   * Clean up specific item and its related data
   */
  async cleanupItem(itemId: number): Promise<void> {
    this.logger.debug(`Cleaning up item ${itemId}`);

    const item = await this.itemsRepository.findOne({
      where: { id: itemId },
      relations: ['images', 'claims'],
    });

    if (!item) {
      return;
    }

    try {
      // Delete all images
      if (item.images && item.images.length > 0) {
        for (const image of item.images) {
          try {
            await this.itemImagesService['deleteFromS3'](`items/${itemId}/${image.filename}`);
            if (image.thumbnailUrl) {
              await this.itemImagesService['deleteFromS3'](`items/${itemId}/thumbnails/${image.filename}`);
            }
          } catch (error) {
            this.logger.warn(`Failed to delete S3 files for image ${image.id}:`, error);
          }
        }

        await this.itemImagesService['imageRepository'].delete({ itemId });
      }

      // Update claims to expired status instead of deleting (for audit trail)
      if (item.claims && item.claims.length > 0) {
        await this.itemClaimsRepository['update'](
          { itemId },
          { 
            status: ClaimStatus.EXPIRED,
            updatedAt: new Date(),
          }
        );
      }

      this.logger.debug(`Cleaned up item ${itemId} successfully`);
    } catch (error) {
      this.logger.error(`Failed to cleanup item ${itemId}:`, error);
      throw error;
    }
  }

  /**
   * Archive old completed items (move to archive table or mark as archived)
   */
  async archiveOldItems(daysOld: number = 90): Promise<number> {
    this.logger.debug(`Archiving items older than ${daysOld} days`);
    
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    
    const result = await this.itemsRepository
      .createQueryBuilder()
      .update()
      .set({ 
        status: 'archived' as any, // Cast to avoid enum restriction
        updatedAt: new Date(),
      })
      .where('created_at < :cutoffDate', { cutoffDate })
      .andWhere('status IN (:...completedStatuses)', {
        completedStatuses: [ItemStatus.CLAIMED, ItemStatus.EXPIRED],
      })
      .execute();

    const archivedCount = result.affected || 0;
    
    if (archivedCount > 0) {
      this.logger.log(`Archived ${archivedCount} old items`);
    }

    return archivedCount;
  }

  /**
   * Get overall system health metrics
   */
  async getSystemHealthMetrics(): Promise<{
    totalItems: number;
    activeItems: number;
    expiredItems: number;
    itemsWithImages: number;
    totalClaims: number;
    activeClaims: number;
    averageClaimsPerItem: number;
  }> {
    const [
      totalItems,
      activeItems, 
      expiredItems,
      itemsWithImages,
      totalClaims,
      activeClaims,
    ] = await Promise.all([
      this.itemsRepository.count(),
      this.itemsRepository.count({ where: { status: ItemStatus.ACTIVE } }),
      this.itemsRepository.count({ where: { status: ItemStatus.EXPIRED } }),
      this.itemsRepository
        .createQueryBuilder('item')
        .leftJoin('item.images', 'image')
        .where('image.id IS NOT NULL')
        .getCount(),
      this.itemClaimsRepository.count(),
      this.itemClaimsRepository.count({ 
        where: { status: ClaimStatus.PENDING } 
      }),
    ]);

    return {
      totalItems,
      activeItems,
      expiredItems,
      itemsWithImages,
      totalClaims,
      activeClaims,
      averageClaimsPerItem: totalItems > 0 ? Math.round((totalClaims / totalItems) * 100) / 100 : 0,
    };
  }
}