import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ItemCategory } from './item-category.entity';
import { ItemClaim } from './item-claim.entity';
import { ItemImage } from './item-image.entity';
import { ItemStatus } from '../../common/enums/item-status.enum';

@Entity('items')
@Index(['userId'])
@Index(['categoryId'])
@Index(['status'])
@Index(['zipCode'])
@Index(['createdAt'])
@Index(['expiresAt'])
@Index(['status', 'expiresAt'])
@Index(['status', 'zipCode', 'createdAt'])
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'category_id', nullable: true })
  categoryId: number;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: ItemStatus,
    default: ItemStatus.ACTIVE,
  })
  status: ItemStatus;

  @Column({ name: 'zip_code', length: 10 })
  zipCode: string;

  @Column({ name: 'location_text', length: 255, nullable: true })
  locationText: string;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location: string;

  @Column({ name: 'pickup_instructions', type: 'text', nullable: true })
  pickupInstructions: string;

  @Column({ name: 'pickup_schedule', type: 'text', nullable: true })
  pickupSchedule: string;

  @Column({ name: 'view_count', default: 0 })
  viewCount: number;

  @Column({ name: 'claim_count', default: 0 })
  claimCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @Column({ name: 'claimed_at', nullable: true })
  claimedAt: Date;

  @Column({ name: 'expired_at', nullable: true })
  expiredAt: Date;

  // Relationships
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => ItemCategory, category => category.items, { 
    nullable: true, 
    onDelete: 'SET NULL' 
  })
  @JoinColumn({ name: 'category_id' })
  category: ItemCategory;

  @OneToMany(() => ItemClaim, claim => claim.item, { cascade: true })
  claims: ItemClaim[] = [];

  @OneToMany(() => ItemImage, image => image.item, { cascade: true })
  images: ItemImage[] = [];

  // Virtual properties
  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  get daysUntilExpiration(): number {
    const now = new Date();
    const timeDiff = this.expiresAt.getTime() - now.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    return Math.max(0, daysDiff);
  }

  get isClaimable(): boolean {
    return this.status === ItemStatus.ACTIVE && !this.isExpired;
  }

  get primaryImage(): ItemImage | null {
    if (!this.images || this.images.length === 0) return null;
    return this.images.find(img => img.isPrimary) || this.images[0];
  }

  get activeClaims(): ItemClaim[] {
    if (!this.claims) return [];
    return this.claims.filter(claim => 
      ['pending', 'contacted'].includes(claim.status)
    );
  }

  get nextClaimInQueue(): ItemClaim | null {
    const activeClaims = this.activeClaims;
    if (activeClaims.length === 0) return null;
    
    return activeClaims.reduce((next, current) => 
      current.queuePosition < next.queuePosition ? current : next
    );
  }

  // Helper methods
  markAsClaimed(): void {
    this.status = ItemStatus.CLAIMED;
    this.claimedAt = new Date();
  }

  markAsExpired(): void {
    this.status = ItemStatus.EXPIRED;
    this.expiredAt = new Date();
  }

  extendExpiration(days: number): void {
    const currentExpiry = new Date(this.expiresAt);
    this.expiresAt = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);
  }

  setPickupSchedule(schedule: string): void {
    this.pickupSchedule = schedule;
  }

  incrementViewCount(): void {
    this.viewCount += 1;
  }

  incrementClaimCount(): void {
    this.claimCount += 1;
  }

  addImage(image: ItemImage): void {
    if (!this.images) this.images = [];
    this.images.push(image);
  }

  removeImage(imageId: number): boolean {
    if (!this.images) return false;
    const initialLength = this.images.length;
    this.images = this.images.filter(img => img.id !== imageId);
    return this.images.length < initialLength;
  }

  setPrimaryImage(imageId: number): boolean {
    if (!this.images) return false;
    
    const targetImage = this.images.find(img => img.id === imageId);
    if (!targetImage) return false;

    // Unset all primary flags
    this.images.forEach(img => img.isPrimary = false);
    // Set target as primary
    targetImage.isPrimary = true;
    return true;
  }

  // Validation
  validateRequiredFields(): void {
    if (!this.title || this.title.trim() === '') {
      throw new Error('Title is required');
    }

    if (!this.description || this.description.trim() === '') {
      throw new Error('Description is required');
    }

    if (!this.zipCode) {
      throw new Error('Zip code is required');
    }

    // Validate zip code format (5 digits or 5+4 format)
    const zipRegex = /^\d{5}(-\d{4})?$/;
    if (!zipRegex.test(this.zipCode)) {
      throw new Error('Invalid zip code format');
    }
  }

  // Search and filtering
  matchesSearch(searchTerm: string): boolean {
    if (!searchTerm) return true;
    
    const term = searchTerm.toLowerCase();
    return (
      this.title.toLowerCase().includes(term) ||
      this.description.toLowerCase().includes(term) ||
      (this.locationText && this.locationText.toLowerCase().includes(term))
    );
  }

  isInRadius(centerLat: number, centerLon: number, radiusMiles: number): boolean {
    // This would need to be implemented using PostGIS functions in practice
    // For now, return true as placeholder
    return true;
  }

  // Lifecycle hooks
  @BeforeInsert()
  beforeInsert(): void {
    // Set expiration to 14 days from creation
    this.expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    
    if (!this.status) {
      this.status = ItemStatus.ACTIVE;
    }
  }

  @BeforeUpdate()
  beforeUpdate(): void {
    this.updatedAt = new Date();
  }
}