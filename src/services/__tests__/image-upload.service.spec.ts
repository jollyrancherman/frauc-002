import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ImageUploadService } from '../image-upload.service';
import { AwsConfigService } from '../../config/aws.config';
import { ConfigService } from '@nestjs/config';

describe('ImageUploadService', () => {
  let service: ImageUploadService;
  let awsConfigService: AwsConfigService;
  let configService: ConfigService;

  const mockAwsConfigService = {
    getS3Client: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockS3Client = {
    upload: jest.fn(),
    deleteObject: jest.fn(),
    headObject: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageUploadService,
        {
          provide: AwsConfigService,
          useValue: mockAwsConfigService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ImageUploadService>(ImageUploadService);
    awsConfigService = module.get<AwsConfigService>(AwsConfigService);
    configService = module.get<ConfigService>(ConfigService);

    mockAwsConfigService.getS3Client.mockReturnValue(mockS3Client);
    mockConfigService.get.mockImplementation((key: string) => {
      const config = {
        'AWS_S3_BUCKET': 'test-bucket',
        'AWS_S3_REGION': 'us-west-2',
        'CLOUDFRONT_DOMAIN': 'https://cdn.example.com',
      };
      return config[key];
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadProfileImage', () => {
    it('should successfully upload profile image', async () => {
      const userId = 1;
      const imageFile = {
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        originalname: 'profile.jpg',
        size: 1024000, // 1MB
      } as Express.Multer.File;

      const expectedKey = `profile-images/user-${userId}-${expect.any(String)}.jpg`;
      const expectedUrl = `https://cdn.example.com/${expectedKey}`;

      mockS3Client.upload.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Location: expectedUrl,
          Key: expectedKey,
        }),
      });

      const result = await service.uploadProfileImage(userId, imageFile);

      expect(mockS3Client.upload).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: expect.stringMatching(/^profile-images\/user-1-\d+\.jpg$/),
        Body: imageFile.buffer,
        ContentType: 'image/jpeg',
        ACL: 'public-read',
        Metadata: {
          'original-name': 'profile.jpg',
          'user-id': '1',
          'upload-date': expect.any(String),
        },
      });

      expect(result).toMatch(/^https:\/\/cdn\.example\.com\/profile-images\/user-1-\d+\.jpg$/);
    });

    it('should handle S3 upload failure', async () => {
      const userId = 1;
      const imageFile = {
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        originalname: 'profile.jpg',
        size: 1024000,
      } as Express.Multer.File;

      mockS3Client.upload.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('S3 upload failed')),
      });

      await expect(service.uploadProfileImage(userId, imageFile))
        .rejects.toThrow('Failed to upload image');
    });
  });

  describe('deleteImage', () => {
    it('should successfully delete image from S3', async () => {
      const imageUrl = 'https://cdn.example.com/profile-images/user-1-123456.jpg';

      mockS3Client.deleteObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      });

      const result = await service.deleteImage(imageUrl);

      expect(mockS3Client.deleteObject).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'profile-images/user-1-123456.jpg',
      });

      expect(result).toBe(true);
    });

    it('should handle S3 delete failure', async () => {
      const imageUrl = 'https://cdn.example.com/profile-images/user-1-123456.jpg';

      mockS3Client.deleteObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('S3 delete failed')),
      });

      const result = await service.deleteImage(imageUrl);

      expect(result).toBe(false);
    });

    it('should handle invalid image URL', async () => {
      const imageUrl = 'invalid-url';

      const result = await service.deleteImage(imageUrl);

      expect(result).toBe(false);
      expect(mockS3Client.deleteObject).not.toHaveBeenCalled();
    });
  });

  describe('validateImageFile', () => {
    it('should validate correct image file', () => {
      const validFile = {
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        originalname: 'profile.jpg',
        size: 1024000, // 1MB
      } as Express.Multer.File;

      const result = service.validateImageFile(validFile);

      expect(result).toBe(true);
    });

    it('should reject non-image file', () => {
      const invalidFile = {
        buffer: Buffer.from('not-an-image'),
        mimetype: 'text/plain',
        originalname: 'document.txt',
        size: 1024,
      } as Express.Multer.File;

      const result = service.validateImageFile(invalidFile);

      expect(result).toBe(false);
    });

    it('should reject oversized image', () => {
      const largeFile = {
        buffer: Buffer.alloc(10 * 1024 * 1024), // 10MB
        mimetype: 'image/jpeg',
        originalname: 'large.jpg',
        size: 10 * 1024 * 1024,
      } as Express.Multer.File;

      const result = service.validateImageFile(largeFile);

      expect(result).toBe(false);
    });

    it('should reject unsupported image format', () => {
      const unsupportedFile = {
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/tiff',
        originalname: 'image.tiff',
        size: 1024000,
      } as Express.Multer.File;

      const result = service.validateImageFile(unsupportedFile);

      expect(result).toBe(false);
    });
  });

  describe('resizeImage', () => {
    it('should resize image to specified dimensions', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      const targetWidth = 300;
      const targetHeight = 300;

      // Mock sharp functionality
      const mockSharp = {
        resize: jest.fn().mockReturnThis(),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized-image-data')),
      };

      jest.doMock('sharp', () => jest.fn(() => mockSharp));

      const result = await service.resizeImage(imageBuffer, targetWidth, targetHeight);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('generateImageKey', () => {
    it('should generate unique image key', () => {
      const userId = 1;
      const originalName = 'profile.jpg';

      const key = (service as any).generateImageKey(userId, originalName);

      expect(key).toMatch(/^profile-images\/user-1-\d+\.jpg$/);
    });

    it('should handle different file extensions', () => {
      const userId = 1;
      const originalName = 'image.png';

      const key = (service as any).generateImageKey(userId, originalName);

      expect(key).toMatch(/^profile-images\/user-1-\d+\.png$/);
    });

    it('should sanitize file names', () => {
      const userId = 1;
      const originalName = 'my profile image!@#$.jpg';

      const key = (service as any).generateImageKey(userId, originalName);

      expect(key).toMatch(/^profile-images\/user-1-\d+\.jpg$/);
      expect(key).not.toContain('!@#$');
    });
  });

  describe('getImageMetadata', () => {
    it('should retrieve image metadata from S3', async () => {
      const imageUrl = 'https://cdn.example.com/profile-images/user-1-123456.jpg';

      mockS3Client.headObject.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          ContentLength: 1024000,
          ContentType: 'image/jpeg',
          LastModified: new Date(),
          Metadata: {
            'original-name': 'profile.jpg',
            'user-id': '1',
          },
        }),
      });

      const result = await service.getImageMetadata(imageUrl);

      expect(result).toEqual({
        size: 1024000,
        contentType: 'image/jpeg',
        lastModified: expect.any(Date),
        originalName: 'profile.jpg',
        userId: '1',
      });
    });

    it('should handle metadata retrieval failure', async () => {
      const imageUrl = 'https://cdn.example.com/nonexistent.jpg';

      mockS3Client.headObject.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Object not found')),
      });

      const result = await service.getImageMetadata(imageUrl);

      expect(result).toBeNull();
    });
  });
});