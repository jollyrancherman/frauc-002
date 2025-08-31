import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemImage } from '../item-image.entity';
import { Item } from '../item.entity';
import { User } from '../../../users/entities/user.entity';

describe('ItemImage Entity', () => {
  let repository: Repository<ItemImage>;
  let itemImage: ItemImage;

  const mockItem = {
    id: 1,
    title: 'Free Laptop',
    description: 'Old laptop, still works',
  } as Item;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getRepositoryToken(ItemImage),
          useClass: Repository,
        },
      ],
    }).compile();

    repository = module.get<Repository<ItemImage>>(getRepositoryToken(ItemImage));
  });

  beforeEach(() => {
    itemImage = new ItemImage();
    itemImage.id = 1;
    itemImage.itemId = 1;
    itemImage.uploadedBy = 1;
    itemImage.filename = 'laptop-image-1.jpg';
    itemImage.originalFilename = 'IMG_20250830_101500.jpg';
    itemImage.mimeType = 'image/jpeg';
    itemImage.fileSize = 2048576; // 2MB
    itemImage.width = 1920;
    itemImage.height = 1080;
    itemImage.url = 'https://s3.amazonaws.com/frauc-images/items/laptop-image-1.jpg';
    itemImage.thumbnailUrl = 'https://s3.amazonaws.com/frauc-images/items/thumbnails/laptop-image-1-thumb.jpg';
    itemImage.sortOrder = 1;
    itemImage.isPrimary = true;
    itemImage.altText = 'Laptop front view showing screen and keyboard';
    itemImage.createdAt = new Date('2025-08-30T10:00:00Z');
    itemImage.item = mockItem;
    itemImage.uploader = mockUser;
  });

  describe('Entity Properties', () => {
    it('should have all required properties', () => {
      expect(itemImage.id).toBe(1);
      expect(itemImage.itemId).toBe(1);
      expect(itemImage.uploadedBy).toBe(1);
      expect(itemImage.filename).toBe('laptop-image-1.jpg');
      expect(itemImage.originalFilename).toBe('IMG_20250830_101500.jpg');
      expect(itemImage.mimeType).toBe('image/jpeg');
      expect(itemImage.fileSize).toBe(2048576);
      expect(itemImage.width).toBe(1920);
      expect(itemImage.height).toBe(1080);
      expect(itemImage.url).toContain('s3.amazonaws.com');
      expect(itemImage.thumbnailUrl).toContain('thumbnails');
      expect(itemImage.sortOrder).toBe(1);
      expect(itemImage.isPrimary).toBe(true);
      expect(itemImage.altText).toContain('Laptop front view');
    });

    it('should have proper timestamps', () => {
      expect(itemImage.createdAt).toBeInstanceOf(Date);
      expect(itemImage.updatedAt).toBeUndefined(); // Not set until update
    });

    it('should have proper relationships', () => {
      expect(itemImage.item).toBe(mockItem);
      expect(itemImage.uploader).toBe(mockUser);
    });
  });

  describe('Virtual Properties', () => {
    it('should calculate file size in MB correctly', () => {
      itemImage.fileSize = 2097152; // 2MB in bytes
      expect(itemImage.fileSizeMB).toBe(2);
    });

    it('should calculate file size for smaller files', () => {
      itemImage.fileSize = 512000; // 0.5MB in bytes
      expect(itemImage.fileSizeMB).toBe(0.5);
    });

    it('should calculate aspect ratio correctly', () => {
      itemImage.width = 1920;
      itemImage.height = 1080;
      expect(itemImage.aspectRatio).toBeCloseTo(1.78, 2); // 16:9 ratio
    });

    it('should calculate aspect ratio for square image', () => {
      itemImage.width = 1000;
      itemImage.height = 1000;
      expect(itemImage.aspectRatio).toBe(1);
    });

    it('should handle zero height gracefully', () => {
      itemImage.width = 1920;
      itemImage.height = 0;
      expect(itemImage.aspectRatio).toBe(0);
    });

    it('should identify landscape orientation', () => {
      itemImage.width = 1920;
      itemImage.height = 1080;
      expect(itemImage.orientation).toBe('landscape');
    });

    it('should identify portrait orientation', () => {
      itemImage.width = 1080;
      itemImage.height = 1920;
      expect(itemImage.orientation).toBe('portrait');
    });

    it('should identify square orientation', () => {
      itemImage.width = 1000;
      itemImage.height = 1000;
      expect(itemImage.orientation).toBe('square');
    });

    it('should extract file extension correctly', () => {
      itemImage.filename = 'laptop-image-1.jpg';
      expect(itemImage.fileExtension).toBe('jpg');
      
      itemImage.filename = 'photo.png';
      expect(itemImage.fileExtension).toBe('png');
      
      itemImage.filename = 'image.jpeg';
      expect(itemImage.fileExtension).toBe('jpeg');
    });
  });

  describe('Helper Methods', () => {
    it('should set as primary image', () => {
      itemImage.isPrimary = false;
      itemImage.setAsPrimary();
      expect(itemImage.isPrimary).toBe(true);
    });

    it('should unset as primary image', () => {
      itemImage.isPrimary = true;
      itemImage.unsetAsPrimary();
      expect(itemImage.isPrimary).toBe(false);
    });

    it('should update sort order', () => {
      itemImage.updateSortOrder(3);
      expect(itemImage.sortOrder).toBe(3);
    });

    it('should update alt text', () => {
      const newAltText = 'Laptop side view showing ports';
      itemImage.updateAltText(newAltText);
      expect(itemImage.altText).toBe(newAltText);
    });

    it('should generate thumbnail URL from main URL', () => {
      itemImage.url = 'https://s3.amazonaws.com/frauc-images/items/laptop-1.jpg';
      itemImage.generateThumbnailUrl();
      expect(itemImage.thumbnailUrl).toBe('https://s3.amazonaws.com/frauc-images/items/thumbnails/laptop-1-thumb.jpg');
    });

    it('should generate CDN URL from S3 URL', () => {
      itemImage.url = 'https://s3.amazonaws.com/frauc-images/items/laptop-1.jpg';
      const cdnUrl = itemImage.getCDNUrl('https://cdn.frauc.com');
      expect(cdnUrl).toBe('https://cdn.frauc.com/items/laptop-1.jpg');
    });

    it('should get compressed URL', () => {
      itemImage.url = 'https://s3.amazonaws.com/frauc-images/items/laptop-1.jpg';
      const compressedUrl = itemImage.getCompressedUrl();
      expect(compressedUrl).toBe('https://s3.amazonaws.com/frauc-images/items/compressed/laptop-1.jpg');
    });
  });

  describe('Validation', () => {
    it('should require item ID', () => {
      itemImage.itemId = null;
      expect(() => itemImage.validateRequiredFields()).toThrow('Item ID is required');
    });

    it('should require uploader ID', () => {
      itemImage.uploadedBy = null;
      expect(() => itemImage.validateRequiredFields()).toThrow('Uploader ID is required');
    });

    it('should require filename', () => {
      itemImage.filename = '';
      expect(() => itemImage.validateRequiredFields()).toThrow('Filename is required');
    });

    it('should require valid URL', () => {
      itemImage.url = 'not-a-valid-url';
      expect(() => itemImage.validateRequiredFields()).toThrow('Invalid image URL');
    });

    it('should validate supported mime types', () => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      
      validTypes.forEach(mimeType => {
        itemImage.mimeType = mimeType;
        expect(() => itemImage.validateRequiredFields()).not.toThrow();
      });
    });

    it('should reject unsupported mime types', () => {
      itemImage.mimeType = 'image/bmp';
      expect(() => itemImage.validateRequiredFields()).toThrow('Unsupported image format');
    });

    it('should validate file size limits', () => {
      itemImage.fileSize = 10 * 1024 * 1024 + 1; // Just over 10MB
      expect(() => itemImage.validateRequiredFields()).toThrow('File size exceeds maximum limit');
    });

    it('should validate image dimensions', () => {
      itemImage.width = 0;
      expect(() => itemImage.validateRequiredFields()).toThrow('Invalid image dimensions');
      
      itemImage.width = 1920;
      itemImage.height = 0;
      expect(() => itemImage.validateRequiredFields()).toThrow('Invalid image dimensions');
    });

    it('should validate sort order is positive', () => {
      itemImage.sortOrder = 0;
      expect(() => itemImage.validateRequiredFields()).toThrow('Sort order must be positive');
    });

    it('should pass validation with all valid fields', () => {
      expect(() => itemImage.validateRequiredFields()).not.toThrow();
    });
  });

  describe('Image Quality Checks', () => {
    it('should identify high quality images', () => {
      itemImage.width = 1920;
      itemImage.height = 1080;
      itemImage.fileSize = 3 * 1024 * 1024; // 3MB
      expect(itemImage.isHighQuality).toBe(true);
    });

    it('should identify low quality images', () => {
      itemImage.width = 640;
      itemImage.height = 480;
      itemImage.fileSize = 100 * 1024; // 100KB
      expect(itemImage.isHighQuality).toBe(false);
    });

    it('should check if image needs compression', () => {
      itemImage.fileSize = 8 * 1024 * 1024; // 8MB
      expect(itemImage.needsCompression).toBe(true);
      
      itemImage.fileSize = 1 * 1024 * 1024; // 1MB
      expect(itemImage.needsCompression).toBe(false);
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should set default values before insert', () => {
      const newImage = new ItemImage();
      newImage.filename = 'test.jpg';
      newImage.beforeInsert();
      
      expect(newImage.sortOrder).toBeGreaterThan(0);
      expect(newImage.isPrimary).toBe(false);
      expect(newImage.altText).toContain('test');
    });

    it('should update timestamp before update', () => {
      const oldDate = new Date('2025-08-29');
      itemImage.updatedAt = oldDate;
      
      itemImage.beforeUpdate();
      expect(itemImage.updatedAt).toBeInstanceOf(Date);
      expect(itemImage.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });

    it('should generate thumbnail URL if missing before insert', () => {
      const newImage = new ItemImage();
      newImage.url = 'https://s3.amazonaws.com/frauc-images/items/test.jpg';
      newImage.thumbnailUrl = null;
      newImage.beforeInsert();
      
      expect(newImage.thumbnailUrl).toContain('thumbnails');
      expect(newImage.thumbnailUrl).toContain('test-thumb.jpg');
    });
  });

  describe('Image Processing Status', () => {
    it('should track processing status', () => {
      itemImage.processingStatus = 'pending';
      expect(itemImage.isProcessing).toBe(true);
      
      itemImage.processingStatus = 'completed';
      expect(itemImage.isProcessing).toBe(false);
      
      itemImage.processingStatus = 'failed';
      expect(itemImage.isProcessing).toBe(false);
    });
  });
});