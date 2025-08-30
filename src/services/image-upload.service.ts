import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AwsConfigService } from '../config/aws.config';
import { PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as path from 'path';

export interface ImageMetadata {
  size: number;
  contentType: string;
  lastModified: Date;
  originalName?: string;
  userId?: string;
}

@Injectable()
export class ImageUploadService {
  private readonly logger = new Logger(ImageUploadService.name);
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  private readonly ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

  constructor(
    private configService: ConfigService,
    private awsConfigService: AwsConfigService,
  ) {}

  async uploadProfileImage(userId: number, file: Express.Multer.File): Promise<string> {
    try {
      const bucket = this.configService.get('AWS_S3_BUCKET');
      const key = this.generateImageKey(userId, file.originalname);
      
      // Resize image if needed (for optimization)
      const optimizedBuffer = await this.resizeImage(file.buffer);

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: optimizedBuffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
        Metadata: {
          'original-name': file.originalname,
          'user-id': userId.toString(),
          'upload-date': new Date().toISOString(),
        },
      });

      await this.awsConfigService.getS3Client().send(command);

      // Return CloudFront URL if available, otherwise S3 URL
      const cloudfrontDomain = this.configService.get('CLOUDFRONT_DOMAIN');
      const imageUrl = cloudfrontDomain 
        ? `${cloudfrontDomain}/${key}`
        : `https://${bucket}.s3.${this.configService.get('AWS_REGION')}.amazonaws.com/${key}`;

      this.logger.log(`Profile image uploaded successfully for user ${userId}`);
      
      return imageUrl;
    } catch (error) {
      this.logger.error(`Failed to upload profile image for user ${userId}`, error);
      throw new Error('Failed to upload image to S3');
    }
  }

  async deleteImage(imageUrl: string): Promise<boolean> {
    try {
      const key = this.extractKeyFromUrl(imageUrl);
      if (!key) {
        this.logger.warn(`Invalid image URL provided: ${imageUrl}`);
        return false;
      }

      const bucket = this.configService.get('AWS_S3_BUCKET');
      
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.awsConfigService.getS3Client().send(command);
      
      this.logger.log(`Image deleted successfully: ${key}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete image: ${imageUrl}`, error);
      return false;
    }
  }

  validateImageFile(file: Express.Multer.File): boolean {
    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return false;
    }

    // Check MIME type
    if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return false;
    }

    // Check file extension
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!this.ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return false;
    }

    // Additional validation: check file signature (magic numbers)
    if (!this.validateFileSignature(file.buffer, file.mimetype)) {
      return false;
    }

    return true;
  }

  async resizeImage(
    imageBuffer: Buffer, 
    width = 300, 
    height = 300,
    quality = 85,
  ): Promise<Buffer> {
    try {
      // In a real implementation, you would use sharp for image processing
      // For now, return the original buffer
      // const sharp = require('sharp');
      // return await sharp(imageBuffer)
      //   .resize(width, height, { fit: 'cover' })
      //   .jpeg({ quality })
      //   .toBuffer();
      
      return imageBuffer; // Placeholder implementation
    } catch (error) {
      this.logger.error('Failed to resize image', error);
      return imageBuffer; // Return original if resize fails
    }
  }

  async getImageMetadata(imageUrl: string): Promise<ImageMetadata | null> {
    try {
      const key = this.extractKeyFromUrl(imageUrl);
      if (!key) {
        return null;
      }

      const bucket = this.configService.get('AWS_S3_BUCKET');
      
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.awsConfigService.getS3Client().send(command);

      return {
        size: response.ContentLength || 0,
        contentType: response.ContentType || 'unknown',
        lastModified: response.LastModified || new Date(),
        originalName: response.Metadata?.['original-name'],
        userId: response.Metadata?.['user-id'],
      };
    } catch (error) {
      this.logger.error(`Failed to get image metadata: ${imageUrl}`, error);
      return null;
    }
  }

  private generateImageKey(userId: number, originalName: string): string {
    const timestamp = Date.now();
    const extension = path.extname(originalName).toLowerCase();
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '');
    
    return `profile-images/user-${userId}-${timestamp}${extension}`;
  }

  private extractKeyFromUrl(imageUrl: string): string | null {
    try {
      // Handle CloudFront URLs
      const cloudfrontDomain = this.configService.get('CLOUDFRONT_DOMAIN');
      if (cloudfrontDomain && imageUrl.startsWith(cloudfrontDomain)) {
        return imageUrl.replace(cloudfrontDomain + '/', '');
      }

      // Handle S3 URLs
      const bucket = this.configService.get('AWS_S3_BUCKET');
      const region = this.configService.get('AWS_REGION');
      
      const s3UrlPatterns = [
        new RegExp(`https://${bucket}\\.s3\\.${region}\\.amazonaws\\.com/(.+)`),
        new RegExp(`https://s3\\.${region}\\.amazonaws\\.com/${bucket}/(.+)`),
        new RegExp(`https://${bucket}\\.s3\\.amazonaws\\.com/(.+)`),
      ];

      for (const pattern of s3UrlPatterns) {
        const match = imageUrl.match(pattern);
        if (match) {
          return match[1];
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to extract key from URL: ${imageUrl}`, error);
      return null;
    }
  }

  private validateFileSignature(buffer: Buffer, mimetype: string): boolean {
    // Check file magic numbers to validate actual file type
    const signatures = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/webp': [0x52, 0x49, 0x46, 0x46], // First 4 bytes of RIFF
    };

    const signature = signatures[mimetype];
    if (!signature) {
      return false;
    }

    // Check if buffer starts with expected signature
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }

    return true;
  }

  // Utility methods for image processing
  getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    // In a real implementation, you would use sharp or similar library
    // const sharp = require('sharp');
    // return sharp(buffer).metadata().then(meta => ({
    //   width: meta.width || 0,
    //   height: meta.height || 0,
    // }));
    
    return Promise.resolve({ width: 0, height: 0 }); // Placeholder
  }

  async generateThumbnail(buffer: Buffer, size = 150): Promise<Buffer> {
    // In a real implementation, you would use sharp
    // const sharp = require('sharp');
    // return await sharp(buffer)
    //   .resize(size, size, { fit: 'cover' })
    //   .jpeg({ quality: 80 })
    //   .toBuffer();
    
    return buffer; // Placeholder
  }

  calculateImageHash(buffer: Buffer): string {
    // Generate hash for duplicate detection
    const crypto = require('crypto');
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  isValidImageRatio(width: number, height: number): boolean {
    // Check if image has reasonable aspect ratio (not too wide or tall)
    const ratio = width / height;
    return ratio >= 0.5 && ratio <= 2.0; // Allow 2:1 to 1:2 ratio
  }
}