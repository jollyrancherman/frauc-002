import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemImage } from '../entities/item-image.entity';
import { Item } from '../entities/item.entity';
import { ItemStatus } from '../../common/enums/item-status.enum';
import * as sharp from 'sharp';
import * as AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import * as mime from 'mime-types';

export interface UploadImageDto {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface ImageProcessingOptions {
  generateThumbnails?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export interface ImageUploadResult {
  image: ItemImage;
  thumbnailUrl?: string;
  compressedUrl?: string;
}

@Injectable()
export class ItemImagesService {
  private s3: AWS.S3;
  private readonly bucketName: string;
  private readonly cdnDomain: string;

  constructor(
    @InjectRepository(ItemImage)
    private readonly imageRepository: Repository<ItemImage>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
  ) {
    // Initialize AWS S3
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
    });
    this.bucketName = process.env.S3_BUCKET_NAME || 'frauc-item-images';
    this.cdnDomain = process.env.CDN_DOMAIN || '';
  }

  /**
   * Upload image for an item
   */
  async uploadImage(
    itemId: number,
    userId: number,
    uploadData: UploadImageDto,
    options: ImageProcessingOptions = {}
  ): Promise<ImageUploadResult> {
    // Verify item exists and user owns it
    const item = await this.itemRepository.findOne({
      where: { id: itemId },
      relations: ['images'],
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    if (item.userId !== userId) {
      throw new ForbiddenException('You can only upload images to your own items');
    }

    // Check if item can still be modified
    if (item.status === ItemStatus.DELETED || item.status === ItemStatus.EXPIRED) {
      throw new BadRequestException('Cannot upload images to deleted or expired items');
    }

    // Validate file
    this.validateImageFile(uploadData);

    // Process the image
    const processedImage = await this.processImage(uploadData.buffer, options);
    
    // Generate unique filename
    const fileExtension = mime.extension(uploadData.mimeType) || 'jpg';
    const filename = `${uuidv4()}.${fileExtension}`;
    
    // Upload to S3
    const uploadPath = `items/${itemId}/${filename}`;
    const imageUrl = await this.uploadToS3(processedImage.buffer, uploadPath, uploadData.mimeType);

    // Generate thumbnails if requested
    let thumbnailUrl: string | undefined;
    if (options.generateThumbnails !== false) {
      const thumbnailBuffer = await this.generateThumbnail(processedImage.buffer, 300, 300);
      const thumbnailPath = `items/${itemId}/thumbnails/${filename}`;
      thumbnailUrl = await this.uploadToS3(thumbnailBuffer, thumbnailPath, uploadData.mimeType);
    }

    // Determine if this should be the primary image
    const imageCount = item.images?.length || 0;
    const isPrimary = imageCount === 0; // First image is primary

    // Save image metadata to database
    const image = this.imageRepository.create({
      itemId,
      uploadedBy: userId,
      filename,
      originalFilename: uploadData.originalName,
      mimeType: uploadData.mimeType,
      fileSize: processedImage.size,
      width: processedImage.width,
      height: processedImage.height,
      url: imageUrl,
      thumbnailUrl,
      sortOrder: imageCount + 1,
      isPrimary,
      processingStatus: 'completed',
    });

    await this.imageRepository.save(image);

    return {
      image,
      thumbnailUrl,
    };
  }

  /**
   * Upload multiple images for an item
   */
  async uploadImages(
    itemId: number,
    userId: number,
    uploads: UploadImageDto[],
    options: ImageProcessingOptions = {}
  ): Promise<ImageUploadResult[]> {
    if (uploads.length > 10) {
      throw new BadRequestException('Maximum 10 images allowed per item');
    }

    const results: ImageUploadResult[] = [];
    
    for (const upload of uploads) {
      try {
        const result = await this.uploadImage(itemId, userId, upload, options);
        results.push(result);
      } catch (error) {
        // Log error but continue with other uploads
        console.error(`Failed to upload image ${upload.originalName}:`, error);
      }
    }

    return results;
  }

  /**
   * Get images for an item
   */
  async getItemImages(itemId: number): Promise<ItemImage[]> {
    return await this.imageRepository.find({
      where: { itemId },
      order: { isPrimary: 'DESC', sortOrder: 'ASC' },
      relations: ['uploader'],
    });
  }

  /**
   * Get a single image
   */
  async getImage(id: number): Promise<ItemImage | null> {
    return await this.imageRepository.findOne({
      where: { id },
      relations: ['item', 'uploader'],
    });
  }

  /**
   * Update image metadata
   */
  async updateImage(
    id: number,
    userId: number,
    updates: Partial<Pick<ItemImage, 'altText' | 'sortOrder'>>
  ): Promise<ItemImage> {
    const image = await this.imageRepository.findOne({
      where: { id },
      relations: ['item'],
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    if (image.uploadedBy !== userId && image.item.userId !== userId) {
      throw new ForbiddenException('You can only update images you uploaded or for items you own');
    }

    await this.imageRepository.update(id, {
      ...updates,
      updatedAt: new Date(),
    });

    return await this.getImage(id);
  }

  /**
   * Set image as primary
   */
  async setPrimaryImage(id: number, userId: number): Promise<void> {
    const image = await this.imageRepository.findOne({
      where: { id },
      relations: ['item'],
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    if (image.item.userId !== userId) {
      throw new ForbiddenException('You can only set primary images for your own items');
    }

    // Begin transaction to update primary status
    await this.imageRepository.manager.transaction(async (manager) => {
      // Unset all other images as non-primary
      await manager.update(ItemImage, 
        { itemId: image.itemId }, 
        { isPrimary: false }
      );

      // Set this image as primary
      await manager.update(ItemImage, id, { isPrimary: true });
    });
  }

  /**
   * Reorder images for an item
   */
  async reorderImages(itemId: number, userId: number, imageIds: number[]): Promise<void> {
    const item = await this.itemRepository.findOne({
      where: { id: itemId },
      relations: ['images'],
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    if (item.userId !== userId) {
      throw new ForbiddenException('You can only reorder images for your own items');
    }

    const images = item.images || [];
    if (imageIds.length !== images.length) {
      throw new BadRequestException('Must provide order for all images');
    }

    // Update sort order for each image
    await Promise.all(
      imageIds.map((imageId, index) =>
        this.imageRepository.update(imageId, { sortOrder: index + 1 })
      )
    );
  }

  /**
   * Delete an image
   */
  async deleteImage(id: number, userId: number): Promise<void> {
    const image = await this.imageRepository.findOne({
      where: { id },
      relations: ['item'],
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    if (image.uploadedBy !== userId && image.item.userId !== userId) {
      throw new ForbiddenException('You can only delete images you uploaded or for items you own');
    }

    // Delete from S3
    await this.deleteFromS3(`items/${image.itemId}/${image.filename}`);
    if (image.thumbnailUrl) {
      await this.deleteFromS3(`items/${image.itemId}/thumbnails/${image.filename}`);
    }

    // Delete from database
    await this.imageRepository.delete(id);

    // If this was the primary image, set another image as primary
    if (image.isPrimary) {
      const nextImage = await this.imageRepository.findOne({
        where: { itemId: image.itemId },
        order: { sortOrder: 'ASC' },
      });

      if (nextImage) {
        await this.imageRepository.update(nextImage.id, { isPrimary: true });
      }
    }
  }

  /**
   * Get images by user
   */
  async getUserImages(userId: number, limit: number = 50): Promise<ItemImage[]> {
    return await this.imageRepository.find({
      where: { uploadedBy: userId },
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['item'],
    });
  }

  /**
   * Validate uploaded image file
   */
  private validateImageFile(upload: UploadImageDto): void {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    if (upload.size > maxSize) {
      throw new BadRequestException('File size cannot exceed 10MB');
    }

    if (!allowedTypes.includes(upload.mimeType)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, and GIF images are allowed');
    }

    // Validate filename
    if (!upload.originalName || upload.originalName.trim().length === 0) {
      throw new BadRequestException('Filename is required');
    }
  }

  /**
   * Process image (resize, compress, etc.)
   */
  private async processImage(
    buffer: Buffer,
    options: ImageProcessingOptions = {}
  ): Promise<{ buffer: Buffer; width: number; height: number; size: number }> {
    const maxWidth = options.maxWidth || 1920;
    const maxHeight = options.maxHeight || 1920;
    const quality = options.quality || 85;

    let image = sharp(buffer);

    // Get image metadata
    const metadata = await image.metadata();

    // Resize if necessary
    if ((metadata.width && metadata.width > maxWidth) || 
        (metadata.height && metadata.height > maxHeight)) {
      image = image.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Compress based on format
    if (metadata.format === 'jpeg') {
      image = image.jpeg({ quality });
    } else if (metadata.format === 'png') {
      image = image.png({ compressionLevel: 9 });
    } else if (metadata.format === 'webp') {
      image = image.webp({ quality });
    }

    const processedBuffer = await image.toBuffer();
    const processedMetadata = await sharp(processedBuffer).metadata();

    return {
      buffer: processedBuffer,
      width: processedMetadata.width || 0,
      height: processedMetadata.height || 0,
      size: processedBuffer.length,
    };
  }

  /**
   * Generate thumbnail
   */
  private async generateThumbnail(
    buffer: Buffer,
    width: number = 300,
    height: number = 300
  ): Promise<Buffer> {
    return await sharp(buffer)
      .resize(width, height, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 80 })
      .toBuffer();
  }

  /**
   * Upload file to S3
   */
  private async uploadToS3(buffer: Buffer, key: string, contentType: string): Promise<string> {
    try {
      const result = await this.s3.upload({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read',
      }).promise();

      return result.Location;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new BadRequestException('Failed to upload image');
    }
  }

  /**
   * Delete file from S3
   */
  private async deleteFromS3(key: string): Promise<void> {
    try {
      await this.s3.deleteObject({
        Bucket: this.bucketName,
        Key: key,
      }).promise();
    } catch (error) {
      console.error('S3 delete error:', error);
      // Don't throw error for delete failures, just log
    }
  }

  /**
   * Get image processing statistics
   */
  async getImageStatistics(): Promise<{
    totalImages: number;
    totalSize: number;
    averageSize: number;
    byMimeType: Record<string, number>;
  }> {
    const images = await this.imageRepository.find();
    
    const totalImages = images.length;
    const totalSize = images.reduce((sum, img) => sum + (img.fileSize || 0), 0);
    const averageSize = totalImages > 0 ? Math.round(totalSize / totalImages) : 0;
    
    const byMimeType = images.reduce((acc, img) => {
      acc[img.mimeType] = (acc[img.mimeType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalImages,
      totalSize,
      averageSize,
      byMimeType,
    };
  }
}