import { Item, ItemCategory, ItemClaim, ItemImage } from '../index';
import { ItemStatus } from '../../../common/enums/item-status.enum';
import { ClaimStatus } from '../../../common/enums/claim-status.enum';

describe('Entity Basic Functionality', () => {
  describe('Item Entity', () => {
    it('should create an item with required properties', () => {
      const item = new Item();
      item.userId = 1;
      item.title = 'Test Item';
      item.description = 'A test item description';
      item.status = ItemStatus.ACTIVE;
      item.zipCode = '12345';
      item.expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      expect(item.title).toBe('Test Item');
      expect(item.description).toBe('A test item description');
      expect(item.status).toBe(ItemStatus.ACTIVE);
      expect(item.zipCode).toBe('12345');
      expect(item.userId).toBe(1);
    });

    it('should correctly calculate isExpired virtual property', () => {
      const activeItem = new Item();
      activeItem.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      expect(activeItem.isExpired).toBe(false);

      const expiredItem = new Item();
      expiredItem.expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      expect(expiredItem.isExpired).toBe(true);
    });

    it('should correctly calculate isClaimable virtual property', () => {
      const activeItem = new Item();
      activeItem.status = ItemStatus.ACTIVE;
      activeItem.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(activeItem.isClaimable).toBe(true);

      const expiredItem = new Item();
      expiredItem.status = ItemStatus.ACTIVE;
      expiredItem.expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(expiredItem.isClaimable).toBe(false);

      const claimedItem = new Item();
      claimedItem.status = ItemStatus.CLAIMED;
      claimedItem.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(claimedItem.isClaimable).toBe(false);
    });

    it('should calculate days until expiration correctly', () => {
      const item = new Item();
      item.expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
      
      expect(item.daysUntilExpiration).toBeGreaterThan(1);
      expect(item.daysUntilExpiration).toBeLessThan(3);
    });
  });

  describe('ItemCategory Entity', () => {
    it('should create a category with required properties', () => {
      const category = new ItemCategory();
      category.name = 'Electronics';
      category.slug = 'electronics';
      category.description = 'Electronic devices';
      category.sortOrder = 1;
      category.isActive = true;

      expect(category.name).toBe('Electronics');
      expect(category.slug).toBe('electronics');
      expect(category.description).toBe('Electronic devices');
      expect(category.sortOrder).toBe(1);
      expect(category.isActive).toBe(true);
    });

    it('should support hierarchical structure', () => {
      const parentCategory = new ItemCategory();
      parentCategory.id = 1;
      parentCategory.name = 'Technology';
      parentCategory.slug = 'technology';

      const childCategory = new ItemCategory();
      childCategory.name = 'Computers';
      childCategory.slug = 'computers';
      childCategory.parentId = parentCategory.id;

      expect(childCategory.parentId).toBe(parentCategory.id);
    });
  });

  describe('ItemClaim Entity', () => {
    it('should create a claim with required properties', () => {
      const claim = new ItemClaim();
      claim.itemId = 1;
      claim.userId = 2;
      claim.queuePosition = 1;
      claim.status = ClaimStatus.PENDING;

      expect(claim.itemId).toBe(1);
      expect(claim.userId).toBe(2);
      expect(claim.queuePosition).toBe(1);
      expect(claim.status).toBe(ClaimStatus.PENDING);
    });

    it('should correctly calculate isNext virtual property', () => {
      const firstClaim = new ItemClaim();
      firstClaim.queuePosition = 1;
      expect(firstClaim.isNext).toBe(true);

      const secondClaim = new ItemClaim();
      secondClaim.queuePosition = 2;
      expect(secondClaim.isNext).toBe(false);
    });

    it('should calculate estimated wait position correctly', () => {
      const firstClaim = new ItemClaim();
      firstClaim.queuePosition = 1;
      expect(firstClaim.estimatedWaitPosition).toBe(0);

      const thirdClaim = new ItemClaim();
      thirdClaim.queuePosition = 3;
      expect(thirdClaim.estimatedWaitPosition).toBe(2);
    });

    it('should identify active claims correctly', () => {
      const pendingClaim = new ItemClaim();
      pendingClaim.status = ClaimStatus.PENDING;
      expect(pendingClaim.isActive).toBe(true);

      const completedClaim = new ItemClaim();
      completedClaim.status = ClaimStatus.COMPLETED;
      expect(completedClaim.isActive).toBe(false);

      const cancelledClaim = new ItemClaim();
      cancelledClaim.status = ClaimStatus.CANCELLED;
      expect(cancelledClaim.isActive).toBe(false);
    });

    it('should provide correct status display text', () => {
      const claim = new ItemClaim();
      
      claim.status = ClaimStatus.PENDING;
      expect(claim.statusDisplayText).toBe('Waiting in queue');

      claim.status = ClaimStatus.CONTACTED;
      expect(claim.statusDisplayText).toBe('Contacted by lister');

      claim.status = ClaimStatus.COMPLETED;
      expect(claim.statusDisplayText).toBe('Item received');
    });

    it('should update status with helper methods', () => {
      const claim = new ItemClaim();
      claim.status = ClaimStatus.PENDING;

      claim.markAsContacted('Sent message');
      expect(claim.status).toBe(ClaimStatus.CONTACTED);
      expect(claim.contactedAt).toBeInstanceOf(Date);

      claim.markAsSelected();
      expect(claim.status).toBe(ClaimStatus.SELECTED);
      expect(claim.selectedAt).toBeInstanceOf(Date);

      claim.markAsCompleted();
      expect(claim.status).toBe(ClaimStatus.COMPLETED);
      expect(claim.completedAt).toBeInstanceOf(Date);
    });

    it('should handle cancellation with reason', () => {
      const claim = new ItemClaim();
      claim.markAsCancelled('User requested cancellation');

      expect(claim.status).toBe(ClaimStatus.CANCELLED);
      expect(claim.cancelledAt).toBeInstanceOf(Date);
      expect(claim.cancellationReason).toBe('User requested cancellation');
    });
  });

  describe('ItemImage Entity', () => {
    it('should create an image with required properties', () => {
      const image = new ItemImage();
      image.itemId = 1;
      image.uploadedBy = 1;
      image.filename = 'test-image.jpg';
      image.originalFilename = 'original-test.jpg';
      image.mimeType = 'image/jpeg';
      image.fileSize = 1024000;
      image.width = 1920;
      image.height = 1080;
      image.url = 'https://s3.amazonaws.com/bucket/test-image.jpg';
      image.sortOrder = 1;
      image.isPrimary = true;

      expect(image.itemId).toBe(1);
      expect(image.uploadedBy).toBe(1);
      expect(image.filename).toBe('test-image.jpg');
      expect(image.originalFilename).toBe('original-test.jpg');
      expect(image.mimeType).toBe('image/jpeg');
      expect(image.fileSize).toBe(1024000);
      expect(image.isPrimary).toBe(true);
      expect(image.sortOrder).toBe(1);
    });

    it('should calculate file size in MB correctly', () => {
      const image = new ItemImage();
      image.fileSize = 2048000; // 2MB in bytes

      expect(image.fileSizeMB).toBeCloseTo(1.95, 2);
    });

    it('should calculate aspect ratio correctly', () => {
      const image = new ItemImage();
      image.width = 1920;
      image.height = 1080;

      expect(image.aspectRatio).toBeCloseTo(1.78, 2); // 16:9 ratio
    });

    it('should determine orientation correctly', () => {
      const landscapeImage = new ItemImage();
      landscapeImage.width = 1920;
      landscapeImage.height = 1080;
      expect(landscapeImage.orientation).toBe('landscape');

      const portraitImage = new ItemImage();
      portraitImage.width = 1080;
      portraitImage.height = 1920;
      expect(portraitImage.orientation).toBe('portrait');

      const squareImage = new ItemImage();
      squareImage.width = 1080;
      squareImage.height = 1080;
      expect(squareImage.orientation).toBe('square');
    });

    it('should identify file extension correctly', () => {
      const image = new ItemImage();
      image.filename = 'test-image.jpg';

      expect(image.fileExtension).toBe('jpg');
    });

    it('should identify high quality images', () => {
      const highQualityImage = new ItemImage();
      highQualityImage.width = 1920;
      highQualityImage.height = 1080;
      highQualityImage.fileSize = 2048000; // 2MB

      expect(highQualityImage.isHighQuality).toBe(true);

      const lowQualityImage = new ItemImage();
      lowQualityImage.width = 800;
      lowQualityImage.height = 600;
      lowQualityImage.fileSize = 512000; // 0.5MB

      expect(lowQualityImage.isHighQuality).toBe(false);
    });
  });

  describe('Entity Validation', () => {
    it('should validate required fields on ItemClaim', () => {
      const claim = new ItemClaim();
      claim.userId = 1;
      claim.contactMethod = 'email';

      expect(() => claim.validateRequiredFields()).toThrow('Item ID is required');

      claim.itemId = 1;
      expect(() => claim.validateRequiredFields()).not.toThrow();
    });

    it('should validate pickup date is in future', () => {
      const claim = new ItemClaim();
      claim.itemId = 1;
      claim.userId = 1;
      claim.contactMethod = 'email';
      claim.preferredPickupDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

      expect(() => claim.validateRequiredFields()).toThrow('Pickup date must be in the future');
    });
  });
});