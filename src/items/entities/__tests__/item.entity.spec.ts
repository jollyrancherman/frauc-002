import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../item.entity';
import { User } from '../../../users/entities/user.entity';
import { ItemCategory } from '../item-category.entity';
import { ItemClaim } from '../item-claim.entity';
import { ItemImage } from '../item-image.entity';
import { ItemStatus } from '../../../common/enums/item-status.enum';

describe('Item Entity', () => {
  let repository: Repository<Item>;
  let item: Item;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
  } as User;

  const mockCategory = {
    id: 1,
    name: 'Electronics',
    slug: 'electronics',
  } as ItemCategory;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getRepositoryToken(Item),
          useClass: Repository,
        },
      ],
    }).compile();

    repository = module.get<Repository<Item>>(getRepositoryToken(Item));
  });

  beforeEach(() => {
    item = new Item();
    item.id = 1;
    item.title = 'Free Laptop';
    item.description = 'Old laptop, still works';
    item.status = ItemStatus.ACTIVE;
    item.zipCode = '12345';
    item.pickupInstructions = 'Front porch pickup';
    item.createdAt = new Date('2025-08-30T10:00:00Z');
    item.expiresAt = new Date('2025-09-13T10:00:00Z'); // 14 days later
    item.user = mockUser;
    item.userId = mockUser.id;
    item.category = mockCategory;
    item.categoryId = mockCategory.id;
  });

  describe('Entity Properties', () => {
    it('should have all required properties', () => {
      expect(item.id).toBeDefined();
      expect(item.title).toBe('Free Laptop');
      expect(item.description).toBe('Old laptop, still works');
      expect(item.status).toBe(ItemStatus.ACTIVE);
      expect(item.zipCode).toBe('12345');
      expect(item.pickupInstructions).toBe('Front porch pickup');
      expect(item.userId).toBe(1);
      expect(item.categoryId).toBe(1);
    });

    it('should have proper timestamps', () => {
      expect(item.createdAt).toBeInstanceOf(Date);
      expect(item.expiresAt).toBeInstanceOf(Date);
      expect(item.updatedAt).toBeUndefined(); // Not set until update
    });

    it('should have proper relationships', () => {
      expect(item.user).toBe(mockUser);
      expect(item.category).toBe(mockCategory);
    });
  });

  describe('Virtual Properties', () => {
    it('should calculate isExpired correctly for active item', () => {
      // Set expiry to future date
      item.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now
      expect(item.isExpired).toBe(false);
    });

    it('should calculate isExpired correctly for expired item', () => {
      // Set expiry to past date
      item.expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      expect(item.isExpired).toBe(true);
    });

    it('should calculate daysUntilExpiration correctly', () => {
      // Set expiry to exactly 7 days from now
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      item.expiresAt = futureDate;
      expect(item.daysUntilExpiration).toBe(7);
    });

    it('should return 0 daysUntilExpiration for expired item', () => {
      item.expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      expect(item.daysUntilExpiration).toBe(0);
    });

    it('should return isClaimable true for active non-expired item', () => {
      item.status = ItemStatus.ACTIVE;
      item.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now
      expect(item.isClaimable).toBe(true);
    });

    it('should return isClaimable false for inactive item', () => {
      item.status = ItemStatus.CLAIMED;
      item.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now
      expect(item.isClaimable).toBe(false);
    });

    it('should return isClaimable false for expired item', () => {
      item.status = ItemStatus.ACTIVE;
      item.expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      expect(item.isClaimable).toBe(false);
    });
  });

  describe('Helper Methods', () => {
    it('should mark item as claimed', () => {
      item.markAsClaimed();
      expect(item.status).toBe(ItemStatus.CLAIMED);
      expect(item.claimedAt).toBeInstanceOf(Date);
    });

    it('should mark item as expired', () => {
      item.markAsExpired();
      expect(item.status).toBe(ItemStatus.EXPIRED);
      expect(item.expiredAt).toBeInstanceOf(Date);
    });

    it('should extend expiration by specified days', () => {
      const originalExpiry = new Date(item.expiresAt);
      item.extendExpiration(7);
      
      const expectedNewExpiry = new Date(originalExpiry.getTime() + 7 * 24 * 60 * 60 * 1000);
      expect(item.expiresAt.getTime()).toBe(expectedNewExpiry.getTime());
    });

    it('should set pickup schedule', () => {
      const scheduleText = 'Weekdays 9am-5pm only';
      item.setPickupSchedule(scheduleText);
      expect(item.pickupSchedule).toBe(scheduleText);
    });
  });

  describe('Validation', () => {
    it('should require title', () => {
      item.title = '';
      expect(() => item.validateRequiredFields()).toThrow('Title is required');
    });

    it('should require description', () => {
      item.description = '';
      expect(() => item.validateRequiredFields()).toThrow('Description is required');
    });

    it('should require valid zip code', () => {
      item.zipCode = '123'; // Too short
      expect(() => item.validateRequiredFields()).toThrow('Invalid zip code format');
    });

    it('should accept valid zip code formats', () => {
      item.zipCode = '12345';
      expect(() => item.validateRequiredFields()).not.toThrow();
      
      item.zipCode = '12345-6789';
      expect(() => item.validateRequiredFields()).not.toThrow();
    });

    it('should pass validation with all required fields', () => {
      expect(() => item.validateRequiredFields()).not.toThrow();
    });
  });

  describe('Collections', () => {
    it('should initialize empty collections', () => {
      const newItem = new Item();
      expect(newItem.claims).toEqual([]);
      expect(newItem.images).toEqual([]);
    });

    it('should handle claims collection', () => {
      const mockClaim = { id: 1, itemId: item.id } as ItemClaim;
      item.claims = [mockClaim];
      expect(item.claims).toHaveLength(1);
      expect(item.claims[0]).toBe(mockClaim);
    });

    it('should handle images collection', () => {
      const mockImage = { id: 1, itemId: item.id } as ItemImage;
      item.images = [mockImage];
      expect(item.images).toHaveLength(1);
      expect(item.images[0]).toBe(mockImage);
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should set expiration date before insert', () => {
      const newItem = new Item();
      newItem.beforeInsert();
      
      expect(newItem.expiresAt).toBeInstanceOf(Date);
      // Should be approximately 14 days from now
      const expectedExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const timeDiff = Math.abs(newItem.expiresAt.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it('should update timestamp before update', () => {
      const oldDate = new Date('2025-08-29');
      item.updatedAt = oldDate;
      
      item.beforeUpdate();
      expect(item.updatedAt).toBeInstanceOf(Date);
      expect(item.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });
  });
});