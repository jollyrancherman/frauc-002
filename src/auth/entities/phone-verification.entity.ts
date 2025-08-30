import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('phone_verifications')
@Index(['userId', 'isVerified'])
@Index(['phoneNumber', 'verificationCode'])
@Index(['expiresAt'])
export class PhoneVerification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'phone_number' })
  phoneNumber: string;

  @Column({ name: 'verification_code', length: 6 })
  verificationCode: string;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ name: 'attempts', default: 0 })
  attempts: number;

  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expiresAt: Date;

  @Column({ name: 'verified_at', type: 'timestamp with time zone', nullable: true })
  verifiedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => User, user => user.phoneVerifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Helper methods
  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  get attemptsRemaining(): number {
    const maxAttempts = 5;
    return Math.max(0, maxAttempts - this.attempts);
  }

  incrementAttempts(): void {
    this.attempts += 1;
  }

  markAsVerified(): void {
    this.isVerified = true;
    this.verifiedAt = new Date();
  }

  extendExpiration(minutes = 15): void {
    this.expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  }

  resetAttempts(): void {
    this.attempts = 0;
  }
}