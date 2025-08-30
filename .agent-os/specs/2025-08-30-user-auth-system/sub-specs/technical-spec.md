# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-08-30-user-auth-system/spec.md

> Created: 2025-08-30
> Version: 1.0.0

## Technical Requirements

### Authentication Methods

#### OAuth Integration
- **Google OAuth 2.0**: Implement Google Sign-In using `@google-cloud/auth-library` and `passport-google-oauth20`
- **Facebook OAuth**: Integration using `passport-facebook` strategy
- **Apple Sign In**: Implementation using `apple-signin-auth` or similar library
- **OAuth Flow**: Authorization code flow with PKCE for security
- **Token Management**: Store OAuth refresh tokens securely in PostgreSQL, access tokens in Redis with TTL

#### Email/Password Authentication
- **Password Hashing**: Use `bcrypt` with minimum cost factor of 12
- **Password Policy**: Minimum 8 characters, require uppercase, lowercase, number, and special character
- **Email Validation**: Implement email format validation and uniqueness constraints
- **Account Verification**: Send verification emails using AWS SES with secure tokens

#### SMS Verification
- **Provider**: AWS SNS for SMS delivery (primary) with Twilio as fallback
- **Verification Flow**: Generate 6-digit OTP with 5-minute expiration
- **Rate Limiting**: Maximum 3 SMS attempts per phone number per hour
- **Storage**: Store verification codes in Redis with TTL

### Progressive Registration Flow

#### Session State Management
- **Session Store**: Redis-based sessions using `connect-redis`
- **Registration Steps**: Multi-step form with persistent state
  1. Authentication method selection
  2. Basic info (name, email/phone)
  3. Profile details and photo upload
  4. Location preferences
  5. Account verification
- **State Persistence**: Store incomplete registration data in Redis with 24-hour TTL

### User Profile Management

#### Image Upload System
- **Storage**: AWS S3 bucket with CloudFront CDN
- **Upload Flow**: Direct browser-to-S3 upload using pre-signed URLs
- **Image Processing**: Lambda function for resizing and optimization
- **File Validation**: Restrict to JPEG/PNG, maximum 10MB
- **Security**: Generate unique file names, scan for malicious content

#### Location Services
- **Integration**: Use browser geolocation API with user consent
- **Storage**: Store coordinates and resolved address in PostgreSQL
- **Privacy**: Allow users to opt-out or provide manual location
- **Accuracy**: Implement location verification for critical features

### Security Implementation

#### Password Recovery
- **Token Generation**: Cryptographically secure random tokens using `crypto.randomBytes()`
- **Token Storage**: Store in PostgreSQL with 1-hour expiration
- **Email Delivery**: Send recovery links using AWS SES templates
- **Token Validation**: Single-use tokens with secure comparison

#### Account Status Management
- **States**: Active, Pending Verification, Suspended, Deactivated
- **Transitions**: Implement state machine with proper validation
- **Audit Trail**: Log all status changes with timestamps and reasons

#### Permission Middleware
- **Registration Status**: Check completion percentage before allowing access
- **Route Protection**: Implement middleware to verify authentication and registration status
- **Feature Flags**: Control access to features based on user state

### Database Design

#### User Schema (PostgreSQL)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20) UNIQUE,
  password_hash TEXT,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  profile_image_url TEXT,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  location_address TEXT,
  status user_status_enum DEFAULT 'pending_verification',
  registration_completed_at TIMESTAMP,
  email_verified_at TIMESTAMP,
  phone_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider oauth_provider_enum,
  provider_account_id VARCHAR(255),
  refresh_token TEXT,
  access_token TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE,
  expires_at TIMESTAMP,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Redis Schema
- **Sessions**: `sess:${sessionId}` → session data
- **Registration State**: `reg:${sessionId}` → partial registration data
- **SMS Verification**: `sms:${phoneNumber}` → verification code and attempts
- **Rate Limiting**: `rate:${identifier}:${action}` → attempt counts

### API Design

#### Authentication Endpoints (NestJS)
```typescript
// Auth Controller Routes
POST /auth/register/email      // Email/password registration
POST /auth/register/oauth      // OAuth registration
POST /auth/login/email         // Email/password login
GET  /auth/login/google        // Google OAuth redirect
GET  /auth/login/facebook      // Facebook OAuth redirect
GET  /auth/login/apple         // Apple Sign In redirect
POST /auth/verify-email        // Email verification
POST /auth/verify-phone        // SMS verification
POST /auth/resend-verification // Resend verification
POST /auth/forgot-password     // Password recovery
POST /auth/reset-password      // Password reset
POST /auth/refresh-token       // Token refresh
POST /auth/logout              // Logout and cleanup
```

#### User Profile Endpoints
```typescript
GET    /users/profile          // Get current user profile
PUT    /users/profile          // Update profile information
POST   /users/profile/image    // Upload profile image
DELETE /users/profile/image    // Remove profile image
PUT    /users/location         // Update location data
GET    /users/registration     // Get registration status
PUT    /users/registration     // Update registration step
```

### Frontend Implementation (Next.js)

#### Authentication Components
- **LoginForm**: Email/password and social login options
- **RegisterForm**: Multi-step registration wizard
- **OAuthButtons**: Styled social authentication buttons
- **VerificationForm**: Email/SMS verification input
- **ForgotPasswordForm**: Password recovery flow
- **ProfileSetup**: Progressive profile completion

#### State Management
- **Context**: AuthContext for global authentication state
- **Hooks**: useAuth, useRegistration, useProfile custom hooks
- **Persistence**: localStorage for token storage, sessionStorage for temporary data

#### Styling (Tailwind CSS)
- **Theme**: Consistent color scheme and typography
- **Components**: Reusable form components and buttons
- **Responsive**: Mobile-first design with proper breakpoints
- **Accessibility**: ARIA labels and keyboard navigation

### Security Considerations

#### HTTPS and Transport Security
- **TLS 1.3**: Enforce modern TLS versions
- **HSTS**: HTTP Strict Transport Security headers
- **Certificate Pinning**: Pin certificates for critical API calls

#### Token Management
- **JWT Structure**: Short-lived access tokens (15 minutes), long-lived refresh tokens (7 days)
- **Token Rotation**: Automatic refresh token rotation on use
- **Secure Storage**: HttpOnly cookies for tokens, no localStorage

#### Rate Limiting
- **Authentication**: 5 failed attempts per IP per 15 minutes
- **SMS**: 3 attempts per phone number per hour
- **Password Reset**: 3 requests per email per hour
- **Registration**: 10 new accounts per IP per day

#### Input Validation
- **Server-side**: Joi validation schemas for all inputs
- **Client-side**: Form validation with immediate feedback
- **Sanitization**: Escape all user inputs before storage

## Approach

### Implementation Strategy

1. **Phase 1: Core Authentication**
   - Set up JWT token system with refresh mechanism
   - Implement email/password authentication
   - Create basic user registration and login flows

2. **Phase 2: OAuth Integration**
   - Add Google OAuth integration
   - Implement Facebook and Apple Sign In
   - Create unified user account linking system

3. **Phase 3: Verification Systems**
   - Integrate SMS verification service
   - Implement email verification flow
   - Add phone number validation

4. **Phase 4: Profile Management**
   - Build profile completion wizard
   - Integrate S3 image upload system
   - Add location services integration

5. **Phase 5: Security Hardening**
   - Implement comprehensive rate limiting
   - Add security headers and CSRF protection
   - Create audit logging system

### Testing Strategy
- **Unit Tests**: Jest for business logic and utility functions
- **Integration Tests**: Supertest for API endpoint testing
- **E2E Tests**: Cypress for complete user flows
- **Security Tests**: Automated vulnerability scanning

### Performance Optimization
- **Caching**: Redis for frequently accessed user data
- **Database**: Proper indexing on email, phone, and OAuth identifiers
- **CDN**: CloudFront for profile images and static assets
- **Monitoring**: Application performance monitoring with alerts

## External Dependencies

This authentication system will require new dependencies not currently in the tech stack:

### Backend Dependencies (NestJS)
```json
{
  "bcrypt": "^5.1.0",
  "jsonwebtoken": "^9.0.2",
  "passport": "^0.6.0",
  "passport-google-oauth20": "^2.0.0",
  "passport-facebook": "^3.0.0",
  "passport-jwt": "^4.0.1",
  "passport-local": "^1.0.0",
  "connect-redis": "^7.1.0",
  "redis": "^4.6.7",
  "aws-sdk": "^2.1419.0",
  "twilio": "^4.14.0",
  "joi": "^17.9.2",
  "nodemailer": "^6.9.4",
  "multer": "^1.4.5-lts.1",
  "multer-s3": "^3.0.1"
}
```

### Frontend Dependencies (Next.js)
```json
{
  "next-auth": "^4.22.1",
  "axios": "^1.4.0",
  "react-hook-form": "^7.45.2",
  "react-query": "^3.39.3",
  "js-cookie": "^3.0.5",
  "react-dropzone": "^14.2.3",
  "react-phone-input-2": "^2.15.1"
}
```

### AWS Services
- **S3**: Profile image storage and static assets
- **CloudFront**: CDN for image delivery
- **SES**: Email delivery service for verification and notifications  
- **SNS**: SMS delivery for phone verification
- **Lambda**: Image processing and optimization
- **IAM**: Service roles and permissions management

### Third-party Services
- **Twilio** (Fallback SMS provider)
- **Google APIs** (OAuth and Maps for location)
- **Facebook Graph API** (OAuth integration)
- **Apple Developer APIs** (Sign In with Apple)

### Development Tools
- **Jest**: Unit and integration testing
- **Cypress**: End-to-end testing
- **ESLint**: Code linting and style enforcement
- **Prettier**: Code formatting
- **Husky**: Git hooks for pre-commit validation