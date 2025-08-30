import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { VerificationType } from '../../common/enums/verification-type.enum';
import { User } from '../../users/entities/user.entity';

@Entity('user_verifications')
@Index(['userId', 'verificationType', 'verificationValue', 'verifiedAt'], { unique: true })
export class UserVerification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({
    type: 'enum',
    enum: VerificationType,
    name: 'verification_type',
  })
  verificationType: VerificationType;

  @Column({ name: 'verification_value' })
  verificationValue: string;

  @Column({ name: 'verification_code', length: 10 })
  verificationCode: string;

  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expiresAt: Date;

  @Column({ name: 'verified_at', type: 'timestamp with time zone', nullable: true })
  verifiedAt: Date;

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'max_attempts', default: 5 })
  maxAttempts: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relationships
  @ManyToOne(() => User, user => user.verifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Methods
  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  get isVerified(): boolean {
    return !!this.verifiedAt;
  }

  get canAttempt(): boolean {
    return this.attempts < this.maxAttempts && !this.isExpired && !this.isVerified;
  }
}