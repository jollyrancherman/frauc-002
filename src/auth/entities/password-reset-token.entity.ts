import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('password_reset_tokens')
@Index(['userId', 'usedAt'], { unique: true })
export class PasswordResetToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ unique: true })
  token: string;

  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamp with time zone', nullable: true })
  usedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string;

  // Relationships
  @ManyToOne(() => User, user => user.passwordResetTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Methods
  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  get isUsed(): boolean {
    return !!this.usedAt;
  }

  get isValid(): boolean {
    return !this.isExpired && !this.isUsed;
  }

  markAsUsed(): void {
    this.usedAt = new Date();
  }
}