import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemsRepository } from '../repositories/items.repository';
import { ItemClaimsRepository } from '../repositories/item-claims.repository';
import { Item } from '../entities/item.entity';
import { ItemCategory } from '../entities/item-category.entity';
import { ItemStatus } from '../../common/enums/item-status.enum';
import { CreateItemDto } from '../dto/create-item.dto';
import { UpdateItemDto } from '../dto/update-item.dto';
import { SearchItemsDto } from '../dto/search-items.dto';
import { ItemSearchFilters, ItemSearchOptions } from '../repositories/items.repository';
import { ClaimQueueInfo } from '../repositories/item-claims.repository';

export interface ItemWithQueueInfo {
  item: Item;
  queueInfo: ClaimQueueInfo;
}

export interface ClaimabilityResult {
  canClaim: boolean;
  reason: string | null;
}

@Injectable()
export class ItemsService {
  constructor(
    private readonly itemsRepository: ItemsRepository,
    private readonly itemClaimsRepository: ItemClaimsRepository,
    @InjectRepository(ItemCategory)
    private readonly categoryRepository: Repository<ItemCategory>,
  ) {}

  /**
   * Create a new item listing
   */
  async create(userId: number, createItemDto: CreateItemDto): Promise<Item> {
    // Validate category exists
    const category = await this.categoryRepository.findOne({
      where: { id: createItemDto.categoryId },
    });

    if (!category) {
      throw new BadRequestException('Category not found');
    }

    // Calculate expiration date
    const daysUntilExpiration = createItemDto.daysUntilExpiration || 14;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysUntilExpiration);

    // Create location point if coordinates provided
    let location: string | null = null;
    if (createItemDto.latitude && createItemDto.longitude) {
      location = `POINT(${createItemDto.longitude} ${createItemDto.latitude})`;
    }

    // Create the item
    const item = this.itemsRepository.create({
      userId,
      title: createItemDto.title,
      description: createItemDto.description,
      categoryId: createItemDto.categoryId,
      zipCode: createItemDto.zipCode,
      location,
      pickupInstructions: createItemDto.pickupInstructions,
      locationText: createItemDto.pickupAddress, // Map to locationText field
      status: ItemStatus.ACTIVE,
      expiresAt,
    });

    return await this.itemsRepository.save(item);
  }

  /**
   * Find all active items with optional filters
   */
  async findAll(searchDto: SearchItemsDto): Promise<{ items: Item[]; total: number }> {
    const filters: ItemSearchFilters = {};
    const options: ItemSearchOptions = {
      page: searchDto.page || 1,
      limit: searchDto.limit || 20,
      sortBy: searchDto.sortBy || 'created_at',
      sortOrder: searchDto.sortOrder || 'DESC',
    };

    // Apply filters
    if (searchDto.categoryId) {
      filters.categoryId = searchDto.categoryId;
    }

    if (searchDto.zipCode) {
      filters.zipCode = searchDto.zipCode;
    }

    if (searchDto.excludeUserId) {
      filters.excludeUserId = searchDto.excludeUserId;
    }

    // Use location-based search if coordinates provided
    if (searchDto.latitude && searchDto.longitude) {
      return await this.itemsRepository.findNearLocation(
        searchDto.latitude,
        searchDto.longitude,
        searchDto.radiusMiles || 25,
        filters,
        options
      );
    }

    // Use search if search term provided
    if (searchDto.searchTerm && searchDto.searchTerm.trim()) {
      return await this.itemsRepository.searchItems(
        searchDto.searchTerm.trim(),
        filters,
        options
      );
    }

    // Default to finding active items
    return await this.itemsRepository.findActiveItems(filters, options);
  }

  /**
   * Search items with full-text search
   */
  async search(
    searchTerm: string,
    filters: ItemSearchFilters = {},
    options: ItemSearchOptions = {}
  ): Promise<{ items: Item[]; total: number }> {
    if (!searchTerm || !searchTerm.trim()) {
      return await this.itemsRepository.findActiveItems(filters, options);
    }

    return await this.itemsRepository.searchItems(searchTerm.trim(), filters, options);
  }

  /**
   * Find items near a specific location
   */
  async findNearby(
    latitude: number,
    longitude: number,
    radiusMiles: number = 25,
    filters: ItemSearchFilters = {},
    options: ItemSearchOptions = {}
  ): Promise<{ items: Item[]; total: number }> {
    return await this.itemsRepository.findNearLocation(
      latitude,
      longitude,
      radiusMiles,
      filters,
      options
    );
  }

  /**
   * Find a single item by ID with all relations
   */
  async findOne(id: number): Promise<Item | null> {
    return await this.itemsRepository.findOne({
      where: { id },
      relations: ['user', 'category', 'images', 'claims', 'claims.user'],
    });
  }

  /**
   * Find items by user
   */
  async findByUser(
    userId: number,
    status?: ItemStatus[],
    options: ItemSearchOptions = {}
  ): Promise<{ items: Item[]; total: number }> {
    return await this.itemsRepository.findByUser(userId, status, options);
  }

  /**
   * Update an item
   */
  async update(id: number, userId: number, updateItemDto: UpdateItemDto): Promise<Item> {
    // Find the item
    const item = await this.itemsRepository.findOne({ 
      where: { id },
      relations: ['claims']
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Check ownership
    if (item.userId !== userId) {
      throw new ForbiddenException('You can only update your own items');
    }

    // Prevent certain updates if item has active claims
    const hasActiveClaims = item.claims && item.claims.some(claim => 
      ['pending', 'contacted', 'selected'].includes(claim.status)
    );

    if (hasActiveClaims) {
      const restrictedFields = ['categoryId'];
      const hasRestrictedUpdates = restrictedFields.some(field => 
        updateItemDto[field] !== undefined
      );

      if (hasRestrictedUpdates) {
        throw new BadRequestException('Cannot change category when item has active claims');
      }
    }

    // Update location if coordinates provided
    let location: string | undefined;
    if (updateItemDto.latitude && updateItemDto.longitude) {
      location = `POINT(${updateItemDto.longitude} ${updateItemDto.latitude})`;
    }

    // Remove fields that aren't entity fields or need special handling
    const { 
      latitude, 
      longitude, 
      pickupAddress,
      contactMethod,
      specialRequirements,
      ...updateData 
    } = updateItemDto;

    // Perform the update
    await this.itemsRepository.update(id, {
      ...updateData,
      ...(location && { location }),
      ...(pickupAddress && { locationText: pickupAddress }),
      updatedAt: new Date(),
    });

    // Return the updated item
    return await this.findOne(id);
  }

  /**
   * Remove an item (soft delete)
   */
  async remove(id: number, userId: number): Promise<void> {
    // Find the item
    const item = await this.itemsRepository.findOne({ where: { id } });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Check ownership
    if (item.userId !== userId) {
      throw new ForbiddenException('You can only delete your own items');
    }

    // Soft delete by changing status
    await this.itemsRepository.update(id, {
      status: ItemStatus.DELETED,
      updatedAt: new Date(),
    });
  }

  /**
   * Change item status
   */
  async changeStatus(id: number, userId: number, status: ItemStatus): Promise<void> {
    const item = await this.itemsRepository.findOne({ where: { id } });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    if (item.userId !== userId) {
      throw new ForbiddenException('You can only update your own items');
    }

    const updateData: Partial<Item> = {
      status,
      updatedAt: new Date(),
    };

    // Set timestamp fields based on status
    if (status === ItemStatus.CLAIMED) {
      updateData.claimedAt = new Date();
    } else if (status === ItemStatus.EXPIRED) {
      updateData.expiredAt = new Date();
    }

    await this.itemsRepository.update(id, updateData);
  }

  /**
   * Get item with queue information
   */
  async getItemWithQueueInfo(id: number, userId?: number): Promise<ItemWithQueueInfo> {
    const item = await this.itemsRepository.findOne({
      where: { id },
      relations: ['user', 'category', 'images'],
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const queueInfo = await this.itemClaimsRepository.getQueueInfo(id, userId);

    return { item, queueInfo };
  }

  /**
   * Check if a user can claim an item
   */
  async canUserClaimItem(itemId: number, userId: number): Promise<ClaimabilityResult> {
    const item = await this.itemsRepository.findOne({ where: { id: itemId } });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Check if user owns the item
    if (item.userId === userId) {
      return { canClaim: false, reason: 'You cannot claim your own item' };
    }

    // Check if item is active
    if (item.status !== ItemStatus.ACTIVE) {
      return { canClaim: false, reason: 'Item is no longer available for claims' };
    }

    // Check if item has expired
    if (item.expiresAt && new Date() > item.expiresAt) {
      return { canClaim: false, reason: 'Item has expired' };
    }

    // Check if user already has an active claim
    const hasExistingClaim = await this.itemClaimsRepository.hasUserClaimedItem(itemId, userId);
    if (hasExistingClaim) {
      return { canClaim: false, reason: 'You already have an active claim for this item' };
    }

    return { canClaim: true, reason: null };
  }

  /**
   * Mark expired items and return count
   */
  async markExpiredItems(): Promise<number> {
    return await this.itemsRepository.markExpiredItems();
  }

  /**
   * Get popular categories based on recent activity
   */
  async getPopularCategories(days: number = 30): Promise<Array<{ categoryId: number; categoryName: string; itemCount: number }>> {
    return await this.itemsRepository.getPopularCategories(days);
  }

  /**
   * Get popular locations based on recent activity
   */
  async getPopularLocations(days: number = 30): Promise<Array<{ zipCode: string; itemCount: number }>> {
    return await this.itemsRepository.getPopularLocations(days);
  }

  /**
   * Get expired items for cleanup
   */
  async getExpiredItems(limit: number = 100): Promise<Item[]> {
    return await this.itemsRepository.findExpiredItems(limit);
  }

  /**
   * Get user's active claims across all items
   */
  async getUserActiveClaims(userId: number): Promise<any[]> {
    return await this.itemClaimsRepository.findActiveClaims(userId);
  }

  /**
   * Get item statistics for analytics
   */
  async getItemStatistics(): Promise<{
    totalItems: number;
    activeItems: number;
    claimedItems: number;
    expiredItems: number;
  }> {
    const [totalItems, activeItems, claimedItems, expiredItems] = await Promise.all([
      this.itemsRepository.count(),
      this.itemsRepository.count({ where: { status: ItemStatus.ACTIVE } }),
      this.itemsRepository.count({ where: { status: ItemStatus.CLAIMED } }),
      this.itemsRepository.count({ where: { status: ItemStatus.EXPIRED } }),
    ]);

    return {
      totalItems,
      activeItems,
      claimedItems,
      expiredItems,
    };
  }
}