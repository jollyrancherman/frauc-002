import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { OAuthProvider } from '../../common/enums/oauth-provider.enum';
import { User } from '../../users/entities/user.entity';

@Entity('social_auth_providers')
@Index(['providerName', 'providerUserId'], { unique: true })
@Index(['userId', 'providerName'], { unique: true })
export class SocialAuthProvider {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({
    type: 'enum',
    enum: OAuthProvider,
    name: 'provider_name',
  })
  providerName: OAuthProvider;

  @Column({ name: 'provider_user_id' })
  providerUserId: string;

  @Column({ name: 'provider_email', nullable: true })
  providerEmail: string;

  @Column({ name: 'provider_data', type: 'jsonb', nullable: true })
  providerData: Record<string, any>;

  @Column({ name: 'access_token_hash', nullable: true })
  accessTokenHash: string;

  @Column({ name: 'refresh_token_hash', nullable: true })
  refreshTokenHash: string;

  @Column({ name: 'token_expires_at', type: 'timestamp with time zone', nullable: true })
  tokenExpiresAt: Date;

  @CreateDateColumn({ name: 'connected_at' })
  connectedAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamp with time zone' })
  lastUsedAt: Date;

  // Relationships
  @ManyToOne(() => User, user => user.socialAuthProviders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Methods
  get isTokenExpired(): boolean {
    return this.tokenExpiresAt ? new Date() > this.tokenExpiresAt : false;
  }

  updateLastUsed(): void {
    this.lastUsedAt = new Date();
  }
}