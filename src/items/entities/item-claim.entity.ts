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
import { ClaimStatus } from '../../common/enums/claim-status.enum';

@Entity('item_claims')
@Index(['itemId'])
@Index(['userId'])
@Index(['itemId', 'queuePosition'])
@Index(['status'])
@Index(['createdAt'])
@Index(['itemId', 'status', 'queuePosition', 'createdAt']) // FIFO queue index
@Index(['itemId', 'userId'], { 
  unique: true, 
  where: `status NOT IN ('completed', 'cancelled')` 
}) // Prevent duplicate claims
export class ItemClaim {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'item_id' })
  itemId: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'queue_position' })
  queuePosition: number;

  @Column({
    type: 'enum',
    enum: ClaimStatus,
    default: ClaimStatus.PENDING,
  })
  status: ClaimStatus;

  @Column({ name: 'preferred_pickup_date', nullable: true })
  preferredPickupDate: Date;

  @Column({ name: 'preferred_pickup_time', length: 100, nullable: true })
  preferredPickupTime: string;

  @Column({
    name: 'contact_method',
    type: 'enum',
    enum: ['email', 'phone', 'both'],
    default: 'email',
  })
  contactMethod: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'lister_notes', type: 'text', nullable: true })
  listerNotes: string;

  @Column({ name: 'cancellation_reason', length: 255, nullable: true })
  cancellationReason: string;

  @Column({ name: 'skip_reason', length: 255, nullable: true })
  skipReason: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'contacted_at', nullable: true })
  contactedAt: Date;

  @Column({ name: 'selected_at', nullable: true })
  selectedAt: Date;

  @Column({ name: 'completed_at', nullable: true })
  completedAt: Date;

  @Column({ name: 'cancelled_at', nullable: true })
  cancelledAt: Date;

  @Column({ name: 'skipped_at', nullable: true })
  skippedAt: Date;

  // Relationships
  @ManyToOne(() => Item, item => item.claims, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Virtual properties for FIFO queue
  get isNext(): boolean {
    return this.queuePosition === 1;
  }

  get estimatedWaitPosition(): number {
    return Math.max(0, this.queuePosition - 1);
  }

  get canBeContacted(): boolean {
    return ['pending', 'contacted'].includes(this.status);
  }

  get pickupWindow(): string {
    if (!this.preferredPickupDate) return 'Not specified';
    
    const date = this.preferredPickupDate.toISOString().split('T')[0];
    const time = this.preferredPickupTime || 'anytime';
    return `${date} ${time}`;
  }

  get isActive(): boolean {
    return !['completed', 'cancelled', 'skipped', 'expired'].includes(this.status);
  }

  get statusDisplayText(): string {
    const statusMap = {
      [ClaimStatus.PENDING]: 'Waiting in queue',
      [ClaimStatus.CONTACTED]: 'Contacted by lister',
      [ClaimStatus.SELECTED]: 'Selected for pickup',
      [ClaimStatus.COMPLETED]: 'Item received',
      [ClaimStatus.CANCELLED]: 'Cancelled',
      [ClaimStatus.SKIPPED]: 'Skipped by lister',
      [ClaimStatus.EXPIRED]: 'Expired',
    };
    return statusMap[this.status] || this.status;
  }

  // Helper methods for status management
  markAsContacted(listerNote?: string): void {
    this.status = ClaimStatus.CONTACTED;
    this.contactedAt = new Date();
    if (listerNote) {
      this.listerNotes = listerNote;
    }
  }

  markAsSelected(): void {
    this.status = ClaimStatus.SELECTED;
    this.selectedAt = new Date();
  }

  markAsCompleted(): void {
    this.status = ClaimStatus.COMPLETED;
    this.completedAt = new Date();
  }

  markAsCancelled(reason: string): void {
    this.status = ClaimStatus.CANCELLED;
    this.cancelledAt = new Date();
    this.cancellationReason = reason;
  }

  markAsSkipped(reason: string): void {
    this.status = ClaimStatus.SKIPPED;
    this.skippedAt = new Date();
    this.skipReason = reason;
  }

  markAsExpired(): void {
    this.status = ClaimStatus.EXPIRED;
  }

  // Queue management methods
  updateQueuePosition(position: number): void {
    this.queuePosition = position;
  }

  moveToFrontOfQueue(): void {
    this.queuePosition = 1;
  }

  // Contact and preference methods
  updatePreferredPickup(date: Date, timeWindow?: string): void {
    this.preferredPickupDate = date;
    if (timeWindow) {
      this.preferredPickupTime = timeWindow;
    }
  }

  updateContactMethod(method: 'email' | 'phone' | 'both'): void {
    this.contactMethod = method;
  }

  addListerNote(note: string): void {
    if (this.listerNotes) {
      this.listerNotes += `\n${new Date().toISOString()}: ${note}`;
    } else {
      this.listerNotes = note;
    }
  }

  addClaimerNote(note: string): void {
    if (this.notes) {
      this.notes += `\n${new Date().toISOString()}: ${note}`;
    } else {
      this.notes = note;
    }
  }

  // Validation
  validateRequiredFields(): void {
    if (!this.itemId) {
      throw new Error('Item ID is required');
    }

    if (!this.userId) {
      throw new Error('User ID is required');
    }

    if (!['email', 'phone', 'both'].includes(this.contactMethod)) {
      throw new Error('Invalid contact method');
    }

    if (this.preferredPickupDate && this.preferredPickupDate < new Date()) {
      throw new Error('Pickup date must be in the future');
    }
  }

  // Time-based helpers
  getWaitTime(): { days: number; hours: number } {
    const waitTime = Date.now() - this.createdAt.getTime();
    const days = Math.floor(waitTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((waitTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return { days, hours };
  }

  isRecentlyClaimed(): boolean {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return this.createdAt > oneHourAgo;
  }

  hasBeenWaitingLong(): boolean {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    return this.createdAt < threeDaysAgo && this.status === ClaimStatus.PENDING;
  }

  // Lifecycle hooks
  @BeforeInsert()
  beforeInsert(): void {
    if (!this.status) {
      this.status = ClaimStatus.PENDING;
    }
    
    // Queue position will be set by database trigger
    if (!this.queuePosition) {
      this.queuePosition = 1; // Fallback, actual position set by DB
    }
  }

  @BeforeUpdate()
  beforeUpdate(): void {
    this.updatedAt = new Date();
  }
}