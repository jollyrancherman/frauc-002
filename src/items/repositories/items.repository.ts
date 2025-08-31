import { Injectable } from '@nestjs/common';
import { Repository, SelectQueryBuilder, DataSource } from 'typeorm';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Item } from '../entities/item.entity';
import { ItemStatus } from '../../common/enums/item-status.enum';

export interface ItemSearchFilters {
  categoryId?: number;
  zipCode?: string;
  radiusMiles?: number;
  centerLat?: number;
  centerLon?: number;
  searchTerm?: string;
  status?: ItemStatus[];
  userId?: number;
  excludeUserId?: number;
}

export interface ItemSearchOptions {
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'title' | 'expires_at' | 'distance';
  sortOrder?: 'ASC' | 'DESC';
}

@Injectable()
export class ItemsRepository extends Repository<Item> {
  constructor(
    @InjectDataSource() dataSource: DataSource,
  ) {
    super(Item, dataSource.createEntityManager());
  }

  /**
   * Find active, non-expired items with optional filters
   */
  async findActiveItems(
    filters: ItemSearchFilters = {},
    options: ItemSearchOptions = {},
  ): Promise<{ items: Item[]; total: number }> {
    const queryBuilder = this.createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.images', 'images')
      .leftJoinAndSelect('item.user', 'user')
      .where('item.status = :status', { status: ItemStatus.ACTIVE })
      .andWhere('item.expires_at > :now', { now: new Date() });

    this.applyFilters(queryBuilder, filters);
    this.applySorting(queryBuilder, options);

    const total = await queryBuilder.getCount();

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    queryBuilder.skip((page - 1) * limit).take(limit);

    const items = await queryBuilder.getMany();

    return { items, total };
  }

  /**
   * Find items by user with status filtering
   */
  async findByUser(
    userId: number,
    status?: ItemStatus[],
    options: ItemSearchOptions = {},
  ): Promise<{ items: Item[]; total: number }> {
    const queryBuilder = this.createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.images', 'images')
      .leftJoinAndSelect('item.claims', 'claims', 'claims.status IN (:...activeStatuses)', {
        activeStatuses: ['pending', 'contacted', 'selected'],
      })
      .where('item.user_id = :userId', { userId });

    if (status && status.length > 0) {
      queryBuilder.andWhere('item.status IN (:...status)', { status });
    }

    this.applySorting(queryBuilder, options);

    const total = await queryBuilder.getCount();

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    queryBuilder.skip((page - 1) * limit).take(limit);

    const items = await queryBuilder.getMany();

    return { items, total };
  }

  /**
   * Search items with full-text search
   */
  async searchItems(
    searchTerm: string,
    filters: ItemSearchFilters = {},
    options: ItemSearchOptions = {},
  ): Promise<{ items: Item[]; total: number }> {
    const queryBuilder = this.createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.images', 'images')
      .leftJoinAndSelect('item.user', 'user')
      .where('item.status = :status', { status: ItemStatus.ACTIVE })
      .andWhere('item.expires_at > :now', { now: new Date() });

    // Add full-text search
    if (searchTerm && searchTerm.trim()) {
      queryBuilder.andWhere(
        `to_tsvector('english', item.title || ' ' || item.description) @@ plainto_tsquery('english', :searchTerm)`,
        { searchTerm: searchTerm.trim() }
      );
    }

    this.applyFilters(queryBuilder, filters);
    this.applySorting(queryBuilder, options);

    const total = await queryBuilder.getCount();

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    queryBuilder.skip((page - 1) * limit).take(limit);

    const items = await queryBuilder.getMany();

    return { items, total };
  }

  /**
   * Find items near a location within radius
   */
  async findNearLocation(
    latitude: number,
    longitude: number,
    radiusMiles: number,
    filters: ItemSearchFilters = {},
    options: ItemSearchOptions = {},
  ): Promise<{ items: Item[]; total: number }> {
    const radiusMeters = radiusMiles * 1609.34; // Convert miles to meters

    const queryBuilder = this.createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.images', 'images')
      .leftJoinAndSelect('item.user', 'user')
      .where('item.status = :status', { status: ItemStatus.ACTIVE })
      .andWhere('item.expires_at > :now', { now: new Date() })
      .andWhere('item.location IS NOT NULL')
      .andWhere(
        'ST_DWithin(item.location::geography, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography, :radius)',
        { latitude, longitude, radius: radiusMeters }
      );

    this.applyFilters(queryBuilder, filters);

    // Add distance-based sorting if requested
    if (options.sortBy === 'distance') {
      queryBuilder.addSelect(
        'ST_Distance(item.location::geography, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography)',
        'distance'
      ).orderBy('distance', 'ASC');
    } else {
      this.applySorting(queryBuilder, options);
    }

    const total = await queryBuilder.getCount();

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    queryBuilder.skip((page - 1) * limit).take(limit);

    const items = await queryBuilder.getMany();

    return { items, total };
  }

  /**
   * Find expired items that need cleanup
   */
  async findExpiredItems(limit = 100): Promise<Item[]> {
    return this.createQueryBuilder('item')
      .where('item.status = :status', { status: ItemStatus.ACTIVE })
      .andWhere('item.expires_at < :now', { now: new Date() })
      .limit(limit)
      .getMany();
  }

  /**
   * Get popular categories based on recent item counts
   */
  async getPopularCategories(days = 30): Promise<Array<{ categoryId: number; categoryName: string; itemCount: number }>> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return this.createQueryBuilder('item')
      .select('item.category_id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('COUNT(*)', 'itemCount')
      .leftJoin('item.category', 'category')
      .where('item.created_at > :cutoffDate', { cutoffDate })
      .andWhere('item.status = :status', { status: ItemStatus.ACTIVE })
      .andWhere('item.category_id IS NOT NULL')
      .groupBy('item.category_id, category.name')
      .orderBy('itemCount', 'DESC')
      .limit(10)
      .getRawMany();
  }

  /**
   * Get popular zip codes based on recent item counts
   */
  async getPopularLocations(days = 30): Promise<Array<{ zipCode: string; itemCount: number }>> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return this.createQueryBuilder('item')
      .select('item.zip_code', 'zipCode')
      .addSelect('COUNT(*)', 'itemCount')
      .where('item.created_at > :cutoffDate', { cutoffDate })
      .andWhere('item.status = :status', { status: ItemStatus.ACTIVE })
      .groupBy('item.zip_code')
      .orderBy('itemCount', 'DESC')
      .limit(20)
      .getRawMany();
  }

  /**
   * Update expired items to expired status
   */
  async markExpiredItems(): Promise<number> {
    const result = await this.createQueryBuilder()
      .update(Item)
      .set({ 
        status: ItemStatus.EXPIRED,
        expiredAt: new Date(),
      })
      .where('status = :status', { status: ItemStatus.ACTIVE })
      .andWhere('expires_at < :now', { now: new Date() })
      .execute();

    return result.affected || 0;
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<Item>, filters: ItemSearchFilters): void {
    if (filters.categoryId) {
      queryBuilder.andWhere('item.category_id = :categoryId', { categoryId: filters.categoryId });
    }

    if (filters.zipCode) {
      queryBuilder.andWhere('item.zip_code = :zipCode', { zipCode: filters.zipCode });
    }

    if (filters.status && filters.status.length > 0) {
      queryBuilder.andWhere('item.status IN (:...status)', { status: filters.status });
    }

    if (filters.userId) {
      queryBuilder.andWhere('item.user_id = :userId', { userId: filters.userId });
    }

    if (filters.excludeUserId) {
      queryBuilder.andWhere('item.user_id != :excludeUserId', { excludeUserId: filters.excludeUserId });
    }
  }

  private applySorting(queryBuilder: SelectQueryBuilder<Item>, options: ItemSearchOptions): void {
    const sortBy = options.sortBy || 'created_at';
    const sortOrder = options.sortOrder || 'DESC';

    switch (sortBy) {
      case 'title':
        queryBuilder.orderBy('item.title', sortOrder);
        break;
      case 'expires_at':
        queryBuilder.orderBy('item.expires_at', sortOrder);
        break;
      case 'created_at':
      default:
        queryBuilder.orderBy('item.created_at', sortOrder);
        break;
    }

    // Always add id as secondary sort for consistent pagination
    queryBuilder.addOrderBy('item.id', sortOrder);
  }
}