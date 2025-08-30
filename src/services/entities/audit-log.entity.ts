import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AuditAction } from '../audit-log.service';

@Entity('audit_logs')
@Index(['userId', 'timestamp'])
@Index(['action', 'timestamp'])
@Index(['ipAddress', 'timestamp'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  action: AuditAction;

  @Column({ name: 'user_id', nullable: true })
  userId: number;

  @Column({ name: 'ip_address', length: 45 })
  ipAddress: string;

  @Column({ name: 'user_agent', nullable: true, length: 500 })
  userAgent: string;

  @Column({ name: 'session_id', nullable: true })
  sessionId: string;

  @Column({ name: 'device_info', nullable: true })
  deviceInfo: string;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true, length: 1000 })
  details: string;

  @Column({ name: 'additional_data', type: 'jsonb', nullable: true })
  additionalData: Record<string, any>;

  @CreateDateColumn({ name: 'timestamp' })
  timestamp: Date;

  // Relationships
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;
}