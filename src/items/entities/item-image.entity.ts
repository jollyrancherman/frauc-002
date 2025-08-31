import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
  Index,
} from 'typeorm';
import { Item } from './item.entity';
import { User } from '../../users/entities/user.entity';

@Entity('item_images')
@Index(['itemId'])
@Index(['uploadedBy'])
@Index(['itemId', 'sortOrder'])
@Index(['itemId', 'isPrimary'])
@Index(['processingStatus'])
@Index(['itemId'], { unique: true, where: 'is_primary = true' }) // Only one primary per item
export class ItemImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'item_id' })
  itemId: number;

  @Column({ name: 'uploaded_by' })
  uploadedBy: number;

  @Column({ length: 255 })
  filename: string;

  @Column({ name: 'original_filename', length: 255 })
  originalFilename: string;

  @Column({ name: 'mime_type', length: 100 })
  mimeType: string;

  @Column({ name: 'file_size' })
  fileSize: number; // in bytes

  @Column()
  width: number;

  @Column()
  height: number;

  @Column({ length: 500 })
  url: string;

  @Column({ name: 'thumbnail_url', length: 500, nullable: true })
  thumbnailUrl: string;

  @Column({ name: 'sort_order', default: 1 })
  sortOrder: number;

  @Column({ name: 'is_primary', default: false })
  isPrimary: boolean;

  @Column({ name: 'alt_text', length: 255, nullable: true })
  altText: string;

  @Column({
    name: 'processing_status',
    type: 'enum',
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'completed',
  })
  processingStatus: string;

  @Column({ name: 'blur_hash', length: 50, nullable: true })
  blurHash: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Item, item => item.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;

  // Virtual properties
  get fileSizeMB(): number {
    return Math.round((this.fileSize / (1024 * 1024)) * 100) / 100;
  }

  get aspectRatio(): number {
    if (this.height === 0) return 0;
    return Math.round((this.width / this.height) * 100) / 100;
  }

  get orientation(): 'landscape' | 'portrait' | 'square' {
    if (this.width > this.height) return 'landscape';
    if (this.height > this.width) return 'portrait';
    return 'square';
  }

  get fileExtension(): string {
    return this.filename.split('.').pop()?.toLowerCase() || '';
  }

  get isHighQuality(): boolean {
    return this.width >= 1200 && this.height >= 800 && this.fileSizeMB >= 1;
  }

  get needsCompression(): boolean {
    return this.fileSizeMB > 5; // Files larger than 5MB
  }

  get isProcessing(): boolean {
    return ['pending', 'processing'].includes(this.processingStatus);
  }

  get displayName(): string {
    return this.altText || `${this.item?.title || 'Item'} - Image ${this.sortOrder}`;
  }

  // Helper methods
  setAsPrimary(): void {
    this.isPrimary = true;
  }

  unsetAsPrimary(): void {
    this.isPrimary = false;
  }

  updateSortOrder(order: number): void {
    this.sortOrder = order;
  }

  updateAltText(altText: string): void {
    this.altText = altText;
  }

  generateThumbnailUrl(): void {
    if (!this.url) return;
    
    // Extract path from URL and insert 'thumbnails' directory
    const urlParts = this.url.split('/');
    const filename = urlParts.pop();
    const pathParts = urlParts.join('/');
    const nameWithoutExt = filename.split('.').slice(0, -1).join('.');
    const extension = filename.split('.').pop();
    
    this.thumbnailUrl = `${pathParts}/thumbnails/${nameWithoutExt}-thumb.${extension}`;
  }

  getCDNUrl(cdnDomain: string): string {
    if (!this.url || !cdnDomain) return this.url;
    
    // Convert S3 URL to CDN URL
    const s3Pattern = /https:\/\/[^\/]+\/([^\/]+\/)?(.+)/;
    const match = this.url.match(s3Pattern);
    if (match) {
      return `${cdnDomain}/${match[2]}`;
    }
    return this.url;
  }

  getCompressedUrl(): string {
    if (!this.url) return this.url;
    
    const urlParts = this.url.split('/');
    const filename = urlParts.pop();
    const pathParts = urlParts.join('/');
    
    return `${pathParts}/compressed/${filename}`;
  }

  getResizedUrl(width: number, height?: number): string {
    if (!this.url) return this.url;
    
    const urlParts = this.url.split('/');
    const filename = urlParts.pop();
    const pathParts = urlParts.join('/');
    const nameWithoutExt = filename.split('.').slice(0, -1).join('.');
    const extension = filename.split('.').pop();
    
    const dimensions = height ? `${width}x${height}` : `${width}w`;
    return `${pathParts}/resized/${nameWithoutExt}_${dimensions}.${extension}`;
  }

  // Image processing methods
  markAsProcessing(): void {
    this.processingStatus = 'processing';
  }

  markAsProcessed(): void {
    this.processingStatus = 'completed';
  }

  markAsProcessingFailed(): void {
    this.processingStatus = 'failed';
  }

  updateDimensions(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  updateFileSize(sizeInBytes: number): void {
    this.fileSize = sizeInBytes;
  }

  setBlurHash(hash: string): void {
    this.blurHash = hash;
  }

  // Validation
  validateRequiredFields(): void {
    if (!this.itemId) {
      throw new Error('Item ID is required');
    }

    if (!this.uploadedBy) {
      throw new Error('Uploader ID is required');
    }

    if (!this.filename || this.filename.trim() === '') {
      throw new Error('Filename is required');
    }

    if (!this.url || !this.isValidUrl(this.url)) {
      throw new Error('Invalid image URL');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(this.mimeType)) {
      throw new Error('Unsupported image format');
    }

    if (this.fileSize > 10 * 1024 * 1024) { // 10MB limit
      throw new Error('File size exceeds maximum limit of 10MB');
    }

    if (this.width <= 0 || this.height <= 0) {
      throw new Error('Invalid image dimensions');
    }

    if (this.sortOrder <= 0) {
      throw new Error('Sort order must be positive');
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Search and filtering
  matchesSearchTerm(term: string): boolean {
    if (!term) return true;
    
    const searchTerm = term.toLowerCase();
    return (
      this.filename.toLowerCase().includes(searchTerm) ||
      this.originalFilename.toLowerCase().includes(searchTerm) ||
      (this.altText && this.altText.toLowerCase().includes(searchTerm))
    );
  }

  // Statistics
  getCompressionRatio(): number {
    if (!this.width || !this.height) return 0;
    const uncompressedSize = this.width * this.height * 3; // Assume RGB
    return Math.round((this.fileSize / uncompressedSize) * 100) / 100;
  }

  // Lifecycle hooks
  @BeforeInsert()
  beforeInsert(): void {
    if (!this.sortOrder || this.sortOrder <= 0) {
      this.sortOrder = Date.now(); // Will be updated by DB trigger
    }

    if (this.isPrimary === undefined) {
      this.isPrimary = false; // Will be set by DB trigger if first image
    }

    if (!this.altText) {
      // Generate basic alt text from filename
      const nameWithoutExt = this.filename.split('.').slice(0, -1).join('.');
      this.altText = nameWithoutExt.replace(/[_-]/g, ' ');
    }

    if (!this.thumbnailUrl && this.url) {
      this.generateThumbnailUrl();
    }
  }

  @BeforeUpdate()
  beforeUpdate(): void {
    this.updatedAt = new Date();
  }
}