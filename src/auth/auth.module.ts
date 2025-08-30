import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { RegistrationService } from './registration.service';
import { RegistrationController } from './registration.controller';
import { SocialAuthService } from './social-auth.service';
import { SocialAuthController } from './social-auth.controller';
import { PhoneVerificationService } from './phone-verification.service';
import { PhoneVerificationController } from './phone-verification.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import { AppleStrategy } from './strategies/apple.strategy';
import { RedisService } from '../config/redis.config';
import { UsersModule } from '../users/users.module';
import { EmailService } from '../services/email.service';
import { SmsService } from '../services/sms.service';
import { AwsConfigService } from '../config/aws.config';
import { UserVerification } from './entities/user-verification.entity';
import { UserSession } from './entities/user-session.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { SocialAuthProvider } from './entities/social-auth-provider.entity';
import { PhoneVerification } from './entities/phone-verification.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserVerification,
      UserSession,
      PasswordResetToken,
      SocialAuthProvider,
      PhoneVerification,
    ]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '15m'),
        },
      }),
    }),
    UsersModule,
  ],
  providers: [
    AuthService, 
    RegistrationService, 
    SocialAuthService,
    PhoneVerificationService,
    JwtStrategy, 
    GoogleStrategy,
    FacebookStrategy,
    AppleStrategy,
    RedisService, 
    EmailService,
    SmsService,
    AwsConfigService
  ],
  controllers: [AuthController, RegistrationController, SocialAuthController, PhoneVerificationController],
  exports: [AuthService, RegistrationService, SocialAuthService, PhoneVerificationService],
})
export class AuthModule {}