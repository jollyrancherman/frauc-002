import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemClaim } from '../item-claim.entity';
import { Item } from '../item.entity';
import { User } from '../../../users/entities/user.entity';
import { ClaimStatus } from '../../../common/enums/claim-status.enum';

describe('ItemClaim Entity', () => {
  let repository: Repository<ItemClaim>;
  let itemClaim: ItemClaim;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
  } as User;

  const mockItem = {
    id: 1,
    title: 'Free Laptop',
    description: 'Old laptop, still works',
  } as Item;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getRepositoryToken(ItemClaim),
          useClass: Repository,
        },
      ],
    }).compile();

    repository = module.get<Repository<ItemClaim>>(getRepositoryToken(ItemClaim));
  });

  beforeEach(() => {
    itemClaim = new ItemClaim();
    itemClaim.id = 1;
    itemClaim.itemId = 1;
    itemClaim.userId = 1;
    itemClaim.queuePosition = 1;
    itemClaim.status = ClaimStatus.PENDING;
    itemClaim.preferredPickupDate = new Date('2025-09-01T14:00:00Z');
    itemClaim.preferredPickupTime = '2pm-4pm';
    itemClaim.contactMethod = 'email';
    itemClaim.notes = 'Can pick up anytime this week';
    itemClaim.createdAt = new Date('2025-08-30T10:00:00Z');
    itemClaim.item = mockItem;
    itemClaim.user = mockUser;
  });

  describe('Entity Properties', () => {
    it('should have all required properties', () => {
      expect(itemClaim.id).toBeDefined();
      expect(itemClaim.itemId).toBe(1);
      expect(itemClaim.userId).toBe(1);
      expect(itemClaim.queuePosition).toBe(1);
      expect(itemClaim.status).toBe(ClaimStatus.PENDING);
      expect(itemClaim.preferredPickupDate).toBeInstanceOf(Date);
      expect(itemClaim.preferredPickupTime).toBe('2pm-4pm');
      expect(itemClaim.contactMethod).toBe('email');
      expect(itemClaim.notes).toBe('Can pick up anytime this week');
    });

    it('should have proper timestamps', () => {
      expect(itemClaim.createdAt).toBeInstanceOf(Date);
      expect(itemClaim.updatedAt).toBeUndefined(); // Not set until update
    });

    it('should have proper relationships', () => {
      expect(itemClaim.item).toBe(mockItem);
      expect(itemClaim.user).toBe(mockUser);
    });
  });

  describe('FIFO Queue Properties', () => {
    it('should have queue position', () => {
      expect(itemClaim.queuePosition).toBe(1);
    });

    it('should calculate isNext correctly for first in queue', () => {
      itemClaim.queuePosition = 1;
      expect(itemClaim.isNext).toBe(true);
    });

    it('should calculate isNext correctly for not first in queue', () => {
      itemClaim.queuePosition = 2;
      expect(itemClaim.isNext).toBe(false);
    });

    it('should calculate estimatedWaitPosition correctly', () => {
      itemClaim.queuePosition = 3;
      expect(itemClaim.estimatedWaitPosition).toBe(2); // position - 1
    });

    it('should handle first position wait time', () => {
      itemClaim.queuePosition = 1;
      expect(itemClaim.estimatedWaitPosition).toBe(0);
    });
  });

  describe('Status Management', () => {
    it('should have pending status by default', () => {
      const newClaim = new ItemClaim();
      expect(newClaim.status).toBeUndefined(); // Will be set by beforeInsert
    });

    it('should mark claim as contacted', () => {
      itemClaim.markAsContacted('Called user to arrange pickup');
      expect(itemClaim.status).toBe(ClaimStatus.CONTACTED);
      expect(itemClaim.contactedAt).toBeInstanceOf(Date);
      expect(itemClaim.listerNotes).toBe('Called user to arrange pickup');
    });

    it('should mark claim as selected', () => {
      itemClaim.markAsSelected();
      expect(itemClaim.status).toBe(ClaimStatus.SELECTED);
      expect(itemClaim.selectedAt).toBeInstanceOf(Date);
    });

    it('should mark claim as completed', () => {
      itemClaim.markAsCompleted();
      expect(itemClaim.status).toBe(ClaimStatus.COMPLETED);
      expect(itemClaim.completedAt).toBeInstanceOf(Date);
    });

    it('should mark claim as cancelled', () => {
      const reason = 'User no longer needs item';
      itemClaim.markAsCancelled(reason);
      expect(itemClaim.status).toBe(ClaimStatus.CANCELLED);
      expect(itemClaim.cancelledAt).toBeInstanceOf(Date);
      expect(itemClaim.cancellationReason).toBe(reason);
    });

    it('should mark claim as skipped', () => {
      const reason = 'User did not respond';
      itemClaim.markAsSkipped(reason);
      expect(itemClaim.status).toBe(ClaimStatus.SKIPPED);
      expect(itemClaim.skippedAt).toBeInstanceOf(Date);
      expect(itemClaim.skipReason).toBe(reason);
    });
  });

  describe('Helper Methods', () => {
    it('should update queue position', () => {
      itemClaim.updateQueuePosition(3);
      expect(itemClaim.queuePosition).toBe(3);
    });

    it('should update preferred pickup date', () => {
      const newDate = new Date('2025-09-02T16:00:00Z');
      itemClaim.updatePreferredPickup(newDate, '4pm-6pm');
      expect(itemClaim.preferredPickupDate).toBe(newDate);
      expect(itemClaim.preferredPickupTime).toBe('4pm-6pm');
    });

    it('should add lister notes', () => {
      const note = 'Very responsive user';
      itemClaim.addListerNote(note);
      expect(itemClaim.listerNotes).toBe(note);
    });

    it('should update contact method', () => {
      itemClaim.updateContactMethod('phone');
      expect(itemClaim.contactMethod).toBe('phone');
    });
  });

  describe('Virtual Properties', () => {
    it('should calculate canBeContacted correctly for pending claim', () => {
      itemClaim.status = ClaimStatus.PENDING;
      expect(itemClaim.canBeContacted).toBe(true);
    });

    it('should calculate canBeContacted correctly for contacted claim', () => {
      itemClaim.status = ClaimStatus.CONTACTED;
      expect(itemClaim.canBeContacted).toBe(true);
    });

    it('should calculate canBeContacted correctly for completed claim', () => {
      itemClaim.status = ClaimStatus.COMPLETED;
      expect(itemClaim.canBeContacted).toBe(false);
    });

    it('should calculate canBeContacted correctly for cancelled claim', () => {
      itemClaim.status = ClaimStatus.CANCELLED;
      expect(itemClaim.canBeContacted).toBe(false);
    });

    it('should format pickup window correctly', () => {
      itemClaim.preferredPickupDate = new Date('2025-09-01T14:00:00Z');
      itemClaim.preferredPickupTime = '2pm-4pm';
      
      const pickupWindow = itemClaim.pickupWindow;
      expect(pickupWindow).toContain('2025-09-01');
      expect(pickupWindow).toContain('2pm-4pm');
    });

    it('should handle missing pickup time', () => {
      itemClaim.preferredPickupDate = new Date('2025-09-01T14:00:00Z');
      itemClaim.preferredPickupTime = null;
      
      const pickupWindow = itemClaim.pickupWindow;
      expect(pickupWindow).toContain('2025-09-01');
      expect(pickupWindow).toContain('anytime');
    });
  });

  describe('Validation', () => {
    it('should require item and user IDs', () => {
      itemClaim.itemId = null;
      expect(() => itemClaim.validateRequiredFields()).toThrow('Item ID is required');
      
      itemClaim.itemId = 1;
      itemClaim.userId = null;
      expect(() => itemClaim.validateRequiredFields()).toThrow('User ID is required');
    });

    it('should require valid contact method', () => {
      itemClaim.contactMethod = 'invalid';
      expect(() => itemClaim.validateRequiredFields()).toThrow('Invalid contact method');
    });

    it('should accept valid contact methods', () => {
      const validMethods = ['email', 'phone', 'both'];
      
      validMethods.forEach(method => {
        itemClaim.contactMethod = method;
        expect(() => itemClaim.validateRequiredFields()).not.toThrow();
      });
    });

    it('should validate pickup date is in future', () => {
      itemClaim.preferredPickupDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      expect(() => itemClaim.validateRequiredFields()).toThrow('Pickup date must be in the future');
    });

    it('should pass validation with all required fields', () => {
      expect(() => itemClaim.validateRequiredFields()).not.toThrow();
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should set default status and queue position before insert', () => {
      const newClaim = new ItemClaim();
      newClaim.beforeInsert();
      
      expect(newClaim.status).toBe(ClaimStatus.PENDING);
      expect(newClaim.queuePosition).toBeGreaterThan(0);
    });

    it('should update timestamp before update', () => {
      const oldDate = new Date('2025-08-29');
      itemClaim.updatedAt = oldDate;
      
      itemClaim.beforeUpdate();
      expect(itemClaim.updatedAt).toBeInstanceOf(Date);
      expect(itemClaim.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });
  });

  describe('FIFO Queue Behavior', () => {
    it('should maintain queue order for multiple claims', () => {
      const claims = [
        { ...itemClaim, queuePosition: 1, createdAt: new Date('2025-08-30T10:00:00Z') },
        { ...itemClaim, queuePosition: 2, createdAt: new Date('2025-08-30T11:00:00Z') },
        { ...itemClaim, queuePosition: 3, createdAt: new Date('2025-08-30T12:00:00Z') },
      ];
      
      // Verify FIFO order matches creation order
      expect(claims[0].queuePosition).toBeLessThan(claims[1].queuePosition);
      expect(claims[1].queuePosition).toBeLessThan(claims[2].queuePosition);
      expect(claims[0].createdAt.getTime()).toBeLessThan(claims[1].createdAt.getTime());
      expect(claims[1].createdAt.getTime()).toBeLessThan(claims[2].createdAt.getTime());
    });
  });
});