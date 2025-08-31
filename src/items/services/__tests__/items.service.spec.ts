import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemsService } from '../items.service';
import { ItemsRepository } from '../../repositories/items.repository';
import { ItemClaimsRepository } from '../../repositories/item-claims.repository';
import { Item } from '../../entities/item.entity';
import { ItemCategory } from '../../entities/item-category.entity';
import { ItemStatus } from '../../../common/enums/item-status.enum';
import { CreateItemDto } from '../../dto/create-item.dto';
import { UpdateItemDto } from '../../dto/update-item.dto';
import { SearchItemsDto } from '../../dto/search-items.dto';

describe('ItemsService', () => {
  let service: ItemsService;
  let itemsRepository: ItemsRepository;
  let itemClaimsRepository: ItemClaimsRepository;
  let categoryRepository: Repository<ItemCategory>;

  const mockItem = {
    id: 1,
    userId: 1,
    categoryId: 1,
    title: 'Free Laptop',
    description: 'Old but working laptop',
    status: ItemStatus.ACTIVE,
    zipCode: '12345',
    location: null,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: 1, firstName: 'John', lastName: 'Doe' },
    category: { id: 1, name: 'Electronics' },
    images: [],
    claims: [],
  } as Item;

  const mockItemsRepository = {
    findActiveItems: jest.fn(),
    findByUser: jest.fn(),
    searchItems: jest.fn(),
    findNearLocation: jest.fn(),
    findExpiredItems: jest.fn(),
    markExpiredItems: jest.fn(),
    getPopularCategories: jest.fn(),
    getPopularLocations: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockItemClaimsRepository = {
    hasUserClaimedItem: jest.fn(),
    getQueueInfo: jest.fn(),
    findActiveClaims: jest.fn(),
  };

  const mockCategoryRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsService,
        {
          provide: ItemsRepository,
          useValue: mockItemsRepository,
        },
        {
          provide: ItemClaimsRepository,
          useValue: mockItemClaimsRepository,
        },
        {
          provide: getRepositoryToken(ItemCategory),
          useValue: mockCategoryRepository,
        },
      ],
    }).compile();

    service = module.get<ItemsService>(ItemsService);
    itemsRepository = module.get<ItemsRepository>(ItemsRepository);
    itemClaimsRepository = module.get<ItemClaimsRepository>(ItemClaimsRepository);
    categoryRepository = module.get<Repository<ItemCategory>>(getRepositoryToken(ItemCategory));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createItemDto: CreateItemDto = {
      title: 'Free Laptop',
      description: 'Old but working laptop',
      categoryId: 1,
      zipCode: '12345',
      contactMethod: 'email',
      pickupInstructions: 'Ring doorbell',
    };

    it('should create a new item successfully', async () => {
      const userId = 1;
      mockCategoryRepository.findOne.mockResolvedValue({ id: 1, name: 'Electronics' });
      mockItemsRepository.create.mockReturnValue(mockItem);
      mockItemsRepository.save.mockResolvedValue(mockItem);

      const result = await service.create(userId, createItemDto);

      expect(mockCategoryRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockItemsRepository.create).toHaveBeenCalledWith({
        userId,
        title: createItemDto.title,
        description: createItemDto.description,
        categoryId: createItemDto.categoryId,
        zipCode: createItemDto.zipCode,
        location: null,
        pickupInstructions: createItemDto.pickupInstructions,
        locationText: createItemDto.pickupAddress,
        status: ItemStatus.ACTIVE,
        expiresAt: expect.any(Date),
      });
      expect(mockItemsRepository.save).toHaveBeenCalledWith(mockItem);
      expect(result).toEqual(mockItem);
    });

    it('should throw error if category does not exist', async () => {
      const userId = 1;
      mockCategoryRepository.findOne.mockResolvedValue(null);

      await expect(service.create(userId, createItemDto)).rejects.toThrow('Category not found');
      expect(mockItemsRepository.save).not.toHaveBeenCalled();
    });

    it('should set default expiration to 14 days', async () => {
      const userId = 1;
      mockCategoryRepository.findOne.mockResolvedValue({ id: 1, name: 'Electronics' });
      mockItemsRepository.create.mockReturnValue(mockItem);
      mockItemsRepository.save.mockResolvedValue(mockItem);

      await service.create(userId, createItemDto);

      const createCall = mockItemsRepository.create.mock.calls[0][0];
      const expirationDate = createCall.expiresAt;
      const expectedDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      
      expect(expirationDate.getTime()).toBeCloseTo(expectedDate.getTime(), -5); // Within 100ms
    });
  });

  describe('findAll', () => {
    const searchDto: SearchItemsDto = {
      page: 1,
      limit: 20,
      categoryId: 1,
      zipCode: '12345',
      searchTerm: 'laptop',
    };

    it('should return paginated active items', async () => {
      const mockResult = { items: [mockItem], total: 1 };
      mockItemsRepository.searchItems.mockResolvedValue(mockResult);

      const result = await service.findAll(searchDto);

      expect(mockItemsRepository.searchItems).toHaveBeenCalledWith(
        'laptop',
        {
          categoryId: 1,
          zipCode: '12345',
          excludeUserId: undefined,
        },
        {
          page: 1,
          limit: 20,
          sortBy: 'created_at',
          sortOrder: 'DESC',
        }
      );
      expect(result).toEqual(mockResult);
    });

    it('should use default pagination if not provided', async () => {
      const mockResult = { items: [mockItem], total: 1 };
      mockItemsRepository.findActiveItems.mockResolvedValue(mockResult);

      await service.findAll({});

      expect(mockItemsRepository.findActiveItems).toHaveBeenCalledWith(
        {},
        {
          page: 1,
          limit: 20,
          sortBy: 'created_at',
          sortOrder: 'DESC',
        }
      );
    });
  });

  describe('search', () => {
    it('should search items with search term', async () => {
      const searchTerm = 'laptop';
      const filters = { categoryId: 1 };
      const options = { page: 1, limit: 10 };
      const mockResult = { items: [mockItem], total: 1 };

      mockItemsRepository.searchItems.mockResolvedValue(mockResult);

      const result = await service.search(searchTerm, filters, options);

      expect(mockItemsRepository.searchItems).toHaveBeenCalledWith(searchTerm, filters, options);
      expect(result).toEqual(mockResult);
    });

    it('should handle empty search term', async () => {
      const mockResult = { items: [mockItem], total: 1 };
      mockItemsRepository.findActiveItems.mockResolvedValue(mockResult);

      const result = await service.search('', {}, {});

      expect(mockItemsRepository.findActiveItems).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });
  });

  describe('findNearby', () => {
    it('should find items near location', async () => {
      const latitude = 40.7128;
      const longitude = -74.0060;
      const radiusMiles = 10;
      const mockResult = { items: [mockItem], total: 1 };

      mockItemsRepository.findNearLocation.mockResolvedValue(mockResult);

      const result = await service.findNearby(latitude, longitude, radiusMiles, {}, {});

      expect(mockItemsRepository.findNearLocation).toHaveBeenCalledWith(
        latitude,
        longitude,
        radiusMiles,
        {},
        {}
      );
      expect(result).toEqual(mockResult);
    });

    it('should use default radius if not provided', async () => {
      const latitude = 40.7128;
      const longitude = -74.0060;
      const mockResult = { items: [mockItem], total: 1 };

      mockItemsRepository.findNearLocation.mockResolvedValue(mockResult);

      await service.findNearby(latitude, longitude, undefined, {}, {});

      expect(mockItemsRepository.findNearLocation).toHaveBeenCalledWith(
        latitude,
        longitude,
        25, // default radius
        {},
        {}
      );
    });
  });

  describe('findOne', () => {
    it('should return item with relations', async () => {
      const itemId = 1;
      mockItemsRepository.findOne.mockResolvedValue(mockItem);

      const result = await service.findOne(itemId);

      expect(mockItemsRepository.findOne).toHaveBeenCalledWith({
        where: { id: itemId },
        relations: ['user', 'category', 'images', 'claims', 'claims.user'],
      });
      expect(result).toEqual(mockItem);
    });

    it('should return null if item not found', async () => {
      const itemId = 999;
      mockItemsRepository.findOne.mockResolvedValue(null);

      const result = await service.findOne(itemId);

      expect(result).toBeNull();
    });
  });

  describe('findByUser', () => {
    it('should return user items with optional status filter', async () => {
      const userId = 1;
      const status = [ItemStatus.ACTIVE];
      const mockResult = { items: [mockItem], total: 1 };

      mockItemsRepository.findByUser.mockResolvedValue(mockResult);

      const result = await service.findByUser(userId, status, { page: 1, limit: 10 });

      expect(mockItemsRepository.findByUser).toHaveBeenCalledWith(
        userId,
        status,
        { page: 1, limit: 10 }
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('update', () => {
    const updateItemDto: UpdateItemDto = {
      title: 'Updated Laptop',
      description: 'Updated description',
    };

    it('should update item successfully', async () => {
      const itemId = 1;
      const userId = 1;
      mockItemsRepository.findOne.mockResolvedValue(mockItem);
      mockItemsRepository.update.mockResolvedValue({ affected: 1 });
      mockItemsRepository.findOne.mockResolvedValueOnce(mockItem); // First call
      mockItemsRepository.findOne.mockResolvedValueOnce({ ...mockItem, ...updateItemDto }); // Second call

      const result = await service.update(itemId, userId, updateItemDto);

      expect(mockItemsRepository.findOne).toHaveBeenCalledWith({ 
        where: { id: itemId },
        relations: ['claims']
      });
      expect(mockItemsRepository.update).toHaveBeenCalledWith(itemId, {
        ...updateItemDto,
        updatedAt: expect.any(Date),
      });
      expect(result).toBeDefined();
    });

    it('should throw error if item not found', async () => {
      const itemId = 999;
      const userId = 1;
      mockItemsRepository.findOne.mockResolvedValue(null);

      await expect(service.update(itemId, userId, updateItemDto)).rejects.toThrow('Item not found');
      expect(mockItemsRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error if user does not own item', async () => {
      const itemId = 1;
      const userId = 2; // Different user
      const itemOwnedByAnotherUser = { ...mockItem, userId: 1 };
      mockItemsRepository.findOne.mockResolvedValue(itemOwnedByAnotherUser);

      await expect(service.update(itemId, userId, updateItemDto)).rejects.toThrow(
        'You can only update your own items'
      );
      expect(mockItemsRepository.update).not.toHaveBeenCalled();
    });

    it('should not allow updating category if item has claims', async () => {
      const itemId = 1;
      const userId = 1;
      const itemWithClaims = { ...mockItem, claims: [{ id: 1, status: 'pending' }] };
      mockItemsRepository.findOne.mockResolvedValueOnce(itemWithClaims); // First call
      mockItemsRepository.findOne.mockResolvedValueOnce({...itemWithClaims, title: 'Updated Title'}); // Second call  
      mockItemsRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.update(itemId, userId, { title: 'Updated Title' });
      expect(result).toBeDefined();
    });
  });

  describe('remove', () => {
    it('should remove item successfully', async () => {
      const itemId = 1;
      const userId = 1;
      mockItemsRepository.findOne.mockResolvedValue(mockItem);
      mockItemsRepository.update.mockResolvedValue({ affected: 1 });

      await service.remove(itemId, userId);

      expect(mockItemsRepository.findOne).toHaveBeenCalledWith({ where: { id: itemId } });
      expect(mockItemsRepository.update).toHaveBeenCalledWith(itemId, {
        status: ItemStatus.DELETED,
        updatedAt: expect.any(Date),
      });
    });

    it('should throw error if item not found', async () => {
      const itemId = 999;
      const userId = 1;
      mockItemsRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(itemId, userId)).rejects.toThrow('Item not found');
      expect(mockItemsRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error if user does not own item', async () => {
      const itemId = 1;
      const userId = 2;
      const itemOwnedByAnotherUser = { ...mockItem, userId: 1 };
      mockItemsRepository.findOne.mockResolvedValue(itemOwnedByAnotherUser);

      await expect(service.remove(itemId, userId)).rejects.toThrow(
        'You can only delete your own items'
      );
      expect(mockItemsRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('changeStatus', () => {
    it('should change item status successfully', async () => {
      const itemId = 1;
      const userId = 1;
      const newStatus = ItemStatus.CLAIMED;
      mockItemsRepository.findOne.mockResolvedValue(mockItem);
      mockItemsRepository.update.mockResolvedValue({ affected: 1 });

      await service.changeStatus(itemId, userId, newStatus);

      expect(mockItemsRepository.update).toHaveBeenCalledWith(itemId, {
        status: newStatus,
        claimedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('should set claimedAt when status changed to CLAIMED', async () => {
      const itemId = 1;
      const userId = 1;
      mockItemsRepository.findOne.mockResolvedValue(mockItem);
      mockItemsRepository.update.mockResolvedValue({ affected: 1 });

      await service.changeStatus(itemId, userId, ItemStatus.CLAIMED);

      expect(mockItemsRepository.update).toHaveBeenCalledWith(itemId, {
        status: ItemStatus.CLAIMED,
        claimedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('getItemWithQueueInfo', () => {
    it('should return item with queue information', async () => {
      const itemId = 1;
      const userId = 1;
      const queueInfo = {
        totalClaims: 3,
        activeClaims: 2,
        userPosition: 2,
        estimatedWait: 1,
        nextClaim: null,
      };

      mockItemsRepository.findOne.mockResolvedValue(mockItem);
      mockItemClaimsRepository.getQueueInfo.mockResolvedValue(queueInfo);

      const result = await service.getItemWithQueueInfo(itemId, userId);

      expect(mockItemsRepository.findOne).toHaveBeenCalledWith({
        where: { id: itemId },
        relations: ['user', 'category', 'images'],
      });
      expect(mockItemClaimsRepository.getQueueInfo).toHaveBeenCalledWith(itemId, userId);
      expect(result).toEqual({ item: mockItem, queueInfo });
    });

    it('should throw error if item not found', async () => {
      const itemId = 999;
      mockItemsRepository.findOne.mockResolvedValue(null);

      await expect(service.getItemWithQueueInfo(itemId, 1)).rejects.toThrow('Item not found');
    });
  });

  describe('canUserClaimItem', () => {
    it('should return true if user can claim item', async () => {
      const itemId = 1;
      const userId = 2; // Different user than owner
      const activeItem = { ...mockItem, status: ItemStatus.ACTIVE, expiresAt: new Date(Date.now() + 1000) };
      
      mockItemsRepository.findOne.mockResolvedValue(activeItem);
      mockItemClaimsRepository.hasUserClaimedItem.mockResolvedValue(false);

      const result = await service.canUserClaimItem(itemId, userId);

      expect(result.canClaim).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('should return false if user owns the item', async () => {
      const itemId = 1;
      const userId = 1; // Same as item owner
      
      mockItemsRepository.findOne.mockResolvedValue(mockItem);

      const result = await service.canUserClaimItem(itemId, userId);

      expect(result.canClaim).toBe(false);
      expect(result.reason).toBe('You cannot claim your own item');
    });

    it('should return false if item is not active', async () => {
      const itemId = 1;
      const userId = 2;
      const claimedItem = { ...mockItem, status: ItemStatus.CLAIMED };
      
      mockItemsRepository.findOne.mockResolvedValue(claimedItem);

      const result = await service.canUserClaimItem(itemId, userId);

      expect(result.canClaim).toBe(false);
      expect(result.reason).toBe('Item is no longer available for claims');
    });

    it('should return false if item has expired', async () => {
      const itemId = 1;
      const userId = 2;
      const expiredItem = { ...mockItem, expiresAt: new Date(Date.now() - 1000) };
      
      mockItemsRepository.findOne.mockResolvedValue(expiredItem);

      const result = await service.canUserClaimItem(itemId, userId);

      expect(result.canClaim).toBe(false);
      expect(result.reason).toBe('Item has expired');
    });

    it('should return false if user already has active claim', async () => {
      const itemId = 1;
      const userId = 2;
      const activeItem = { ...mockItem, status: ItemStatus.ACTIVE, expiresAt: new Date(Date.now() + 1000) };
      
      mockItemsRepository.findOne.mockResolvedValue(activeItem);
      mockItemClaimsRepository.hasUserClaimedItem.mockResolvedValue(true);

      const result = await service.canUserClaimItem(itemId, userId);

      expect(result.canClaim).toBe(false);
      expect(result.reason).toBe('You already have an active claim for this item');
    });
  });

  describe('markExpiredItems', () => {
    it('should mark expired items and return count', async () => {
      const affectedCount = 5;
      mockItemsRepository.markExpiredItems.mockResolvedValue(affectedCount);

      const result = await service.markExpiredItems();

      expect(mockItemsRepository.markExpiredItems).toHaveBeenCalled();
      expect(result).toBe(affectedCount);
    });
  });

  describe('getPopularCategories', () => {
    it('should return popular categories with item counts', async () => {
      const mockCategories = [
        { categoryId: 1, categoryName: 'Electronics', itemCount: 10 },
        { categoryId: 2, categoryName: 'Furniture', itemCount: 5 },
      ];
      
      mockItemsRepository.getPopularCategories.mockResolvedValue(mockCategories);

      const result = await service.getPopularCategories(30);

      expect(mockItemsRepository.getPopularCategories).toHaveBeenCalledWith(30);
      expect(result).toEqual(mockCategories);
    });
  });

  describe('getPopularLocations', () => {
    it('should return popular zip codes with item counts', async () => {
      const mockLocations = [
        { zipCode: '12345', itemCount: 8 },
        { zipCode: '67890', itemCount: 3 },
      ];
      
      mockItemsRepository.getPopularLocations.mockResolvedValue(mockLocations);

      const result = await service.getPopularLocations(30);

      expect(mockItemsRepository.getPopularLocations).toHaveBeenCalledWith(30);
      expect(result).toEqual(mockLocations);
    });
  });
});