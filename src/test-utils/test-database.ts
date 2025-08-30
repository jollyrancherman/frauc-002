import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { UserVerification } from '../auth/entities/user-verification.entity';
import { UserSession } from '../auth/entities/user-session.entity';
import { PasswordResetToken } from '../auth/entities/password-reset-token.entity';
import { SocialAuthProvider } from '../auth/entities/social-auth-provider.entity';

export const TestDatabaseModule = TypeOrmModule.forRoot({
  type: 'sqlite',
  database: ':memory:',
  entities: [
    User,
    UserVerification,
    UserSession,
    PasswordResetToken,
    SocialAuthProvider,
  ],
  synchronize: true,
  logging: false,
});