import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { UserVerification } from '../../auth/entities/user-verification.entity';
import { UserSession } from '../../auth/entities/user-session.entity';
import { PasswordResetToken } from '../../auth/entities/password-reset-token.entity';
import { SocialAuthProvider } from '../../auth/entities/social-auth-provider.entity';
import { PhoneVerification } from '../../auth/entities/phone-verification.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true, nullable: true })
  phone: string;

  @Column({ nullable: true })
  @Exclude()
  passwordHash: string;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ name: 'profile_image_url', nullable: true })
  profileImageUrl: string;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location: string; // This will store the PostGIS POINT

  @Column({ name: 'location_text', nullable: true })
  locationText: string;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.PENDING_VERIFICATION,
    name: 'account_status',
  })
  accountStatus: AccountStatus;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ name: 'phone_verified', default: false })
  phoneVerified: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'last_login_at', nullable: true })
  lastLoginAt: Date;

  @Column({ name: 'deactivated_at', nullable: true })
  deactivatedAt: Date;

  @Column({ name: 'reactivated_at', nullable: true })
  reactivatedAt: Date;

  @Column({ name: 'deactivation_reason', nullable: true })
  deactivationReason: string;

  // Relationships
  @OneToMany(() => UserVerification, verification => verification.user)
  verifications: UserVerification[];

  @OneToMany(() => UserSession, session => session.user)
  sessions: UserSession[];

  @OneToMany(() => PasswordResetToken, token => token.user)
  passwordResetTokens: PasswordResetToken[];

  @OneToMany(() => SocialAuthProvider, provider => provider.user)
  socialAuthProviders: SocialAuthProvider[];

  @OneToMany(() => PhoneVerification, verification => verification.user)
  phoneVerifications: PhoneVerification[];

  // Virtual properties
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get isProfileComplete(): boolean {
    return !!(
      this.firstName &&
      this.lastName &&
      this.email &&
      (this.emailVerified || this.phoneVerified)
    );
  }

  // Lifecycle hooks
  @BeforeInsert()
  @BeforeUpdate()
  validateContactInfo() {
    if (!this.email && !this.phone) {
      throw new Error('User must have either email or phone number');
    }
  }

  @BeforeUpdate()
  updateTimestamp() {
    this.updatedAt = new Date();
  }
}