import { Test, TestingModule } from '@nestjs/testing';
import { ItemClaimsService } from '../item-claims.service';
import { ItemClaimsRepository } from '../../repositories/item-claims.repository';
import { ItemsRepository } from '../../repositories/items.repository';
import { ItemClaim } from '../../entities/item-claim.entity';
import { Item } from '../../entities/item.entity';
import { ClaimStatus } from '../../../common/enums/claim-status.enum';
import { ItemStatus } from '../../../common/enums/item-status.enum';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ItemClaimsService', () => {
  let service: ItemClaimsService;
  let claimsRepository: ItemClaimsRepository;
  let itemsRepository: ItemsRepository;

  const mockItem = {
    id: 1,
    userId: 1,
    title: 'Free Laptop',
    status: ItemStatus.ACTIVE,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  } as Item;

  const mockClaim = {
    id: 1,
    itemId: 1,
    userId: 2,
    queuePosition: 1,
    status: ClaimStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ItemClaim;

  const mockClaimsRepository = {
    createClaim: jest.fn(),
    getQueueInfo: jest.fn(),
    getQueueForItem: jest.fn(),
    getNextInQueue: jest.fn(),
    hasUserClaimedItem: jest.fn(),
    findUserClaims: jest.fn(),
    findActiveClaims: jest.fn(),
    removeClaim: jest.fn(),
    moveToPosition: jest.fn(),
    getStaleClains: jest.fn(),
    getClaimsForLister: jest.fn(),
    getQueueStatistics: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    find: jest.fn(),
  };

  const mockItemsRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemClaimsService,
        {
          provide: ItemClaimsRepository,
          useValue: mockClaimsRepository,
        },
        {
          provide: ItemsRepository,
          useValue: mockItemsRepository,
        },
      ],
    }).compile();

    service = module.get<ItemClaimsService>(ItemClaimsService);
    claimsRepository = module.get<ItemClaimsRepository>(ItemClaimsRepository);
    itemsRepository = module.get<ItemsRepository>(ItemsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createClaim', () => {
    const createClaimDto = {
      itemId: 1,
      preferredPickupDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      contactMethod: 'email' as const,
      notes: 'Looking forward to picking this up',
    };

    it('should create a claim successfully', async () => {
      const userId = 2;
      mockItemsRepository.findOne.mockResolvedValue(mockItem);
      mockClaimsRepository.hasUserClaimedItem.mockResolvedValue(false);
      mockClaimsRepository.createClaim.mockResolvedValue(mockClaim);

      const result = await service.createClaim(userId, createClaimDto);

      expect(mockItemsRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockClaimsRepository.hasUserClaimedItem).toHaveBeenCalledWith(1, userId);
      expect(mockClaimsRepository.createClaim).toHaveBeenCalledWith(1, userId, {
        preferredPickupDate: createClaimDto.preferredPickupDate,
        contactMethod: createClaimDto.contactMethod,
        notes: createClaimDto.notes,
      });
      expect(result).toEqual(mockClaim);
    });

    it('should throw error if item not found', async () => {
      const userId = 2;
      mockItemsRepository.findOne.mockResolvedValue(null);

      await expect(service.createClaim(userId, createClaimDto)).rejects.toThrow(NotFoundException);
      expect(mockClaimsRepository.createClaim).not.toHaveBeenCalled();
    });

    it('should throw error if item is not claimable', async () => {
      const userId = 2;
      const expiredItem = { ...mockItem, status: ItemStatus.EXPIRED };
      mockItemsRepository.findOne.mockResolvedValue(expiredItem);

      await expect(service.createClaim(userId, createClaimDto)).rejects.toThrow(BadRequestException);
      expect(mockClaimsRepository.createClaim).not.toHaveBeenCalled();
    });

    it('should throw error if user owns the item', async () => {
      const userId = 1; // Same as item owner
      mockItemsRepository.findOne.mockResolvedValue(mockItem);

      await expect(service.createClaim(userId, createClaimDto)).rejects.toThrow(BadRequestException);
      expect(mockClaimsRepository.createClaim).not.toHaveBeenCalled();
    });

    it('should throw error if user already has active claim', async () => {
      const userId = 2;
      mockItemsRepository.findOne.mockResolvedValue(mockItem);
      mockClaimsRepository.hasUserClaimedItem.mockResolvedValue(true);

      await expect(service.createClaim(userId, createClaimDto)).rejects.toThrow(BadRequestException);
      expect(mockClaimsRepository.createClaim).not.toHaveBeenCalled();
    });

    it('should increment item claim count after successful claim', async () => {
      const userId = 2;
      mockItemsRepository.findOne.mockResolvedValue(mockItem);
      mockClaimsRepository.hasUserClaimedItem.mockResolvedValue(false);
      mockClaimsRepository.createClaim.mockResolvedValue(mockClaim);
      mockItemsRepository.update.mockResolvedValue({ affected: 1 });

      await service.createClaim(userId, createClaimDto);

      expect(mockItemsRepository.update).toHaveBeenCalledWith(1, {
        claimCount: expect.any(Number),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('getQueueInfo', () => {
    it('should return queue information for an item', async () => {
      const itemId = 1;
      const userId = 2;
      const mockQueueInfo = {
        totalClaims: 3,
        activeClaims: 2,
        userPosition: 2,
        estimatedWait: 1,
        nextClaim: mockClaim,
      };

      mockClaimsRepository.getQueueInfo.mockResolvedValue(mockQueueInfo);

      const result = await service.getQueueInfo(itemId, userId);

      expect(mockClaimsRepository.getQueueInfo).toHaveBeenCalledWith(itemId, userId);
      expect(result).toEqual(mockQueueInfo);
    });

    it('should return queue info without user context when userId not provided', async () => {
      const itemId = 1;
      const mockQueueInfo = {
        totalClaims: 3,
        activeClaims: 2,
        userPosition: null,
        estimatedWait: 0,
        nextClaim: mockClaim,
      };

      mockClaimsRepository.getQueueInfo.mockResolvedValue(mockQueueInfo);

      const result = await service.getQueueInfo(itemId);

      expect(mockClaimsRepository.getQueueInfo).toHaveBeenCalledWith(itemId, undefined);
      expect(result).toEqual(mockQueueInfo);
    });
  });

  describe('getQueue', () => {
    it('should return ordered queue for an item', async () => {
      const itemId = 1;
      const mockQueue = [
        { ...mockClaim, queuePosition: 1 },
        { ...mockClaim, id: 2, queuePosition: 2 },
      ];

      mockClaimsRepository.getQueueForItem.mockResolvedValue(mockQueue);

      const result = await service.getQueue(itemId, false);

      expect(mockClaimsRepository.getQueueForItem).toHaveBeenCalledWith(itemId, false);
      expect(result).toEqual(mockQueue);
    });

    it('should include inactive claims when requested', async () => {
      const itemId = 1;
      mockClaimsRepository.getQueueForItem.mockResolvedValue([mockClaim]);

      await service.getQueue(itemId, true);

      expect(mockClaimsRepository.getQueueForItem).toHaveBeenCalledWith(itemId, true);
    });
  });

  describe('getNextInQueue', () => {
    it('should return next claim in queue', async () => {
      const itemId = 1;
      mockClaimsRepository.getNextInQueue.mockResolvedValue(mockClaim);

      const result = await service.getNextInQueue(itemId);

      expect(mockClaimsRepository.getNextInQueue).toHaveBeenCalledWith(itemId);
      expect(result).toEqual(mockClaim);
    });

    it('should return null if no claims in queue', async () => {
      const itemId = 1;
      mockClaimsRepository.getNextInQueue.mockResolvedValue(null);

      const result = await service.getNextInQueue(itemId);

      expect(result).toBeNull();
    });
  });

  describe('getUserClaims', () => {
    it('should return user claims with optional filters', async () => {
      const userId = 2;
      const status = [ClaimStatus.PENDING];
      const mockClaims = [mockClaim];

      mockClaimsRepository.findUserClaims.mockResolvedValue(mockClaims);

      const result = await service.getUserClaims(userId, status, 10);

      expect(mockClaimsRepository.findUserClaims).toHaveBeenCalledWith(userId, status, 10);
      expect(result).toEqual(mockClaims);
    });
  });

  describe('getActiveClaims', () => {
    it('should return active claims for user', async () => {
      const userId = 2;
      const mockClaims = [mockClaim];

      mockClaimsRepository.findActiveClaims.mockResolvedValue(mockClaims);

      const result = await service.getActiveClaims(userId);

      expect(mockClaimsRepository.findActiveClaims).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockClaims);
    });
  });

  describe('cancelClaim', () => {
    it('should cancel claim successfully', async () => {
      const claimId = 1;
      const userId = 2;
      const reason = 'Changed my mind';
      
      mockClaimsRepository.findOne.mockResolvedValue(mockClaim);
      mockClaimsRepository.removeClaim.mockResolvedValue(undefined);

      await service.cancelClaim(claimId, userId, reason);

      expect(mockClaimsRepository.findOne).toHaveBeenCalledWith({
        where: { id: claimId },
        relations: ['item'],
      });
      expect(mockClaimsRepository.removeClaim).toHaveBeenCalledWith(
        claimId,
        reason,
        ClaimStatus.CANCELLED
      );
    });

    it('should throw error if claim not found', async () => {
      const claimId = 999;
      mockClaimsRepository.findOne.mockResolvedValue(null);

      await expect(service.cancelClaim(claimId, 2, 'reason')).rejects.toThrow(NotFoundException);
      expect(mockClaimsRepository.removeClaim).not.toHaveBeenCalled();
    });

    it('should throw error if user does not own claim', async () => {
      const claimId = 1;
      const wrongUserId = 3;
      mockClaimsRepository.findOne.mockResolvedValue(mockClaim);

      await expect(service.cancelClaim(claimId, wrongUserId, 'reason')).rejects.toThrow(ForbiddenException);
      expect(mockClaimsRepository.removeClaim).not.toHaveBeenCalled();
    });
  });

  describe('contactClaimer', () => {
    it('should update claim status to contacted', async () => {
      const claimId = 1;
      const listerUserId = 1;
      const message = 'Please pick up tomorrow';
      const claimWithItem = { ...mockClaim, item: mockItem };

      mockClaimsRepository.findOne.mockResolvedValue(claimWithItem);
      mockClaimsRepository.update.mockResolvedValue({ affected: 1 });

      await service.contactClaimer(claimId, listerUserId, message);

      expect(mockClaimsRepository.findOne).toHaveBeenCalledWith({
        where: { id: claimId },
        relations: ['item', 'user'],
      });
      expect(mockClaimsRepository.update).toHaveBeenCalledWith(claimId, {
        status: ClaimStatus.CONTACTED,
        contactedAt: expect.any(Date),
        listerNotes: message,
        updatedAt: expect.any(Date),
      });
    });

    it('should throw error if claim not found', async () => {
      mockClaimsRepository.findOne.mockResolvedValue(null);

      await expect(service.contactClaimer(1, 1, 'message')).rejects.toThrow(NotFoundException);
    });

    it('should throw error if user does not own the item', async () => {
      const claimWithItem = { ...mockClaim, item: { ...mockItem, userId: 2 } };
      mockClaimsRepository.findOne.mockResolvedValue(claimWithItem);

      await expect(service.contactClaimer(1, 1, 'message')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('selectClaimer', () => {
    it('should select claimer and update item status', async () => {
      const claimId = 1;
      const listerUserId = 1;
      const claimWithItem = { ...mockClaim, item: mockItem };

      mockClaimsRepository.findOne.mockResolvedValue(claimWithItem);
      mockClaimsRepository.update.mockResolvedValue({ affected: 1 });
      mockItemsRepository.update.mockResolvedValue({ affected: 1 });

      await service.selectClaimer(claimId, listerUserId);

      expect(mockClaimsRepository.update).toHaveBeenCalledWith(claimId, {
        status: ClaimStatus.SELECTED,
        selectedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(mockItemsRepository.update).toHaveBeenCalledWith(1, {
        status: ItemStatus.CLAIMED,
        claimedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('completeClaim', () => {
    it('should complete claim successfully', async () => {
      const claimId = 1;
      const userId = 2;
      const selectedClaim = { ...mockClaim, status: ClaimStatus.SELECTED };

      mockClaimsRepository.findOne.mockResolvedValue(selectedClaim);
      mockClaimsRepository.update.mockResolvedValue({ affected: 1 });

      await service.completeClaim(claimId, userId);

      expect(mockClaimsRepository.update).toHaveBeenCalledWith(claimId, {
        status: ClaimStatus.COMPLETED,
        completedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('should throw error if claim is not selected', async () => {
      const claimId = 1;
      mockClaimsRepository.findOne.mockResolvedValue(mockClaim);

      await expect(service.completeClaim(claimId, 2)).rejects.toThrow(BadRequestException);
    });
  });

  describe('skipClaimer', () => {
    it('should skip claimer and advance queue', async () => {
      const claimId = 1;
      const listerUserId = 1;
      const reason = 'No response';
      const claimWithItem = { ...mockClaim, item: mockItem };

      mockClaimsRepository.findOne.mockResolvedValue(claimWithItem);
      mockClaimsRepository.removeClaim.mockResolvedValue(undefined);

      await service.skipClaimer(claimId, listerUserId, reason);

      expect(mockClaimsRepository.removeClaim).toHaveBeenCalledWith(
        claimId,
        reason,
        ClaimStatus.SKIPPED
      );
    });
  });

  describe('moveClaimInQueue', () => {
    it('should move claim to new position', async () => {
      const claimId = 1;
      const newPosition = 3;
      const listerUserId = 1;
      const claimWithItem = { ...mockClaim, item: mockItem };

      mockClaimsRepository.findOne.mockResolvedValue(claimWithItem);
      mockClaimsRepository.moveToPosition.mockResolvedValue(undefined);

      await service.moveClaimInQueue(claimId, newPosition, listerUserId);

      expect(mockClaimsRepository.moveToPosition).toHaveBeenCalledWith(claimId, newPosition);
    });

    it('should throw error if user does not own the item', async () => {
      const claimWithItem = { ...mockClaim, item: { ...mockItem, userId: 2 } };
      mockClaimsRepository.findOne.mockResolvedValue(claimWithItem);

      await expect(service.moveClaimInQueue(1, 3, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getClaimsForLister', () => {
    it('should return claims for lister management', async () => {
      const listerUserId = 1;
      const mockClaims = [mockClaim];

      mockClaimsRepository.getClaimsForLister.mockResolvedValue(mockClaims);

      const result = await service.getClaimsForLister(listerUserId, 1, [ClaimStatus.PENDING]);

      expect(mockClaimsRepository.getClaimsForLister).toHaveBeenCalledWith(
        listerUserId,
        1,
        [ClaimStatus.PENDING]
      );
      expect(result).toEqual(mockClaims);
    });
  });

  describe('getQueueStatistics', () => {
    it('should return queue statistics for an item', async () => {
      const itemId = 1;
      const mockStats = {
        totalClaims: 5,
        activeClaims: 2,
        completedClaims: 2,
        cancelledClaims: 1,
        averageWaitTime: 24.5,
      };

      mockClaimsRepository.getQueueStatistics.mockResolvedValue(mockStats);

      const result = await service.getQueueStatistics(itemId);

      expect(mockClaimsRepository.getQueueStatistics).toHaveBeenCalledWith(itemId);
      expect(result).toEqual(mockStats);
    });
  });

  describe('processExpiredClaims', () => {
    it('should process expired claims and advance queue', async () => {
      const staleClaims = [
        { ...mockClaim, id: 1 },
        { ...mockClaim, id: 2 },
      ];

      mockClaimsRepository.getStaleClains.mockResolvedValue(staleClaims);
      mockClaimsRepository.removeClaim.mockResolvedValue(undefined);

      const result = await service.processExpiredClaims(48);

      expect(mockClaimsRepository.getStaleClains).toHaveBeenCalledWith(48);
      expect(mockClaimsRepository.removeClaim).toHaveBeenCalledTimes(2);
      expect(result).toBe(2);
    });

    it('should handle errors when processing individual claims', async () => {
      const staleClaims = [mockClaim];
      mockClaimsRepository.getStaleClains.mockResolvedValue(staleClaims);
      mockClaimsRepository.removeClaim.mockRejectedValue(new Error('Database error'));

      const result = await service.processExpiredClaims(48);

      expect(result).toBe(0); // Should return 0 due to error
    });
  });

  describe('getClaimAnalytics', () => {
    it('should return claim analytics', async () => {
      // Mock all the repository calls needed for analytics
      mockClaimsRepository.count.mockResolvedValue(10);
      mockClaimsRepository.find.mockResolvedValue([
        { 
          createdAt: new Date(), 
          completedAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: ClaimStatus.COMPLETED 
        }
      ]);
      mockItemsRepository.count.mockResolvedValue(5);
      
      const result = await service.getClaimAnalytics();

      expect(result).toBeDefined();
      expect(typeof result.totalClaimsToday).toBe('number');
      expect(typeof result.completionRate).toBe('number');
      expect(typeof result.averageWaitTime).toBe('number');
      expect(Array.isArray(result.mostPopularCategories)).toBe(true);
      expect(Array.isArray(result.peakClaimHours)).toBe(true);
    });
  });

  describe('updateClaimPreferences', () => {
    it('should update claim preferences', async () => {
      const claimId = 1;
      const userId = 2;
      const preferences = {
        preferredPickupDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
        contactMethod: 'phone' as const,
        notes: 'Updated notes',
      };

      mockClaimsRepository.findOne.mockResolvedValue(mockClaim);
      mockClaimsRepository.update.mockResolvedValue({ affected: 1 });

      await service.updateClaimPreferences(claimId, userId, preferences);

      expect(mockClaimsRepository.update).toHaveBeenCalledWith(claimId, {
        ...preferences,
        updatedAt: expect.any(Date),
      });
    });

    it('should throw error if user does not own claim', async () => {
      mockClaimsRepository.findOne.mockResolvedValue(mockClaim);

      await expect(
        service.updateClaimPreferences(1, 3, {})
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('notifyNextInQueue', () => {
    it('should identify next claim to notify', async () => {
      const itemId = 1;
      mockClaimsRepository.getNextInQueue.mockResolvedValue(mockClaim);

      const result = await service.notifyNextInQueue(itemId);

      expect(mockClaimsRepository.getNextInQueue).toHaveBeenCalledWith(itemId);
      expect(result).toEqual(mockClaim);
    });

    it('should return null if no next claim', async () => {
      const itemId = 1;
      mockClaimsRepository.getNextInQueue.mockResolvedValue(null);

      const result = await service.notifyNextInQueue(itemId);

      expect(result).toBeNull();
    });
  });
});