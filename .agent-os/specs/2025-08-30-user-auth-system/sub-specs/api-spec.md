# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-08-30-user-auth-system/spec.md

> Created: 2025-08-30
> Version: 1.0.0

## Base Configuration

- **Base URL:** `/api/v1`
- **Authentication:** JWT Bearer tokens
- **Content-Type:** `application/json`
- **Rate Limiting:** 100 requests per minute per IP
- **Framework:** NestJS with Express

## Authentication Endpoints

### 1. User Registration

#### Progressive Registration - Step 1: Basic Info
```
POST /auth/register/basic
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Validation Rules:**
- `email`: Valid email format, unique
- `password`: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
- `firstName`: 2-50 chars, letters only
- `lastName`: 2-50 chars, letters only

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid-v4",
    "email": "user@example.com",
    "registrationStep": 1,
    "nextStep": "verification"
  },
  "message": "Registration initiated. Please verify your email."
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Email already exists"
      }
    ]
  }
}
```

#### Progressive Registration - Step 2: Verification
```
POST /auth/register/verify
```

**Request Body:**
```json
{
  "userId": "uuid-v4",
  "verificationCode": "123456",
  "verificationType": "email"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid-v4",
    "registrationStep": 2,
    "nextStep": "profile"
  },
  "message": "Email verified successfully"
}
```

#### Progressive Registration - Step 3: Profile Setup
```
POST /auth/register/profile
```

**Request Body:**
```json
{
  "userId": "uuid-v4",
  "phoneNumber": "+1234567890",
  "dateOfBirth": "1990-01-01",
  "gender": "male",
  "location": {
    "city": "New York",
    "state": "NY",
    "country": "US"
  }
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-v4",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "profileComplete": true
    },
    "tokens": {
      "accessToken": "jwt-token",
      "refreshToken": "refresh-jwt-token"
    }
  },
  "message": "Registration completed successfully"
}
```

### 2. User Authentication

#### Login
```
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "rememberMe": true
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-v4",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "profileComplete": true,
      "accountStatus": "active"
    },
    "tokens": {
      "accessToken": "jwt-token",
      "refreshToken": "refresh-jwt-token"
    }
  },
  "message": "Login successful"
}
```

**Error Response (401):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

#### Logout
```
POST /auth/logout
```

**Headers:** `Authorization: Bearer {token}`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### Token Refresh
```
POST /auth/refresh
```

**Request Body:**
```json
{
  "refreshToken": "refresh-jwt-token"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "new-jwt-token",
    "refreshToken": "new-refresh-jwt-token"
  }
}
```

## Social Authentication Endpoints

### 3. OAuth Integration

#### Google OAuth Initiate
```
GET /auth/google
```

**Response:** Redirects to Google OAuth consent screen

#### Google OAuth Callback
```
GET /auth/google/callback?code={authorization_code}
```

**Success Response:** Redirects to frontend with tokens in query params or sets cookies

#### Facebook OAuth Initiate
```
GET /auth/facebook
```

#### Facebook OAuth Callback
```
GET /auth/facebook/callback?code={authorization_code}
```

#### Apple OAuth Initiate
```
GET /auth/apple
```

#### Apple OAuth Callback
```
POST /auth/apple/callback
```

**Request Body:**
```json
{
  "code": "authorization_code",
  "id_token": "apple_id_token"
}
```

## Verification Endpoints

### 4. Email Verification

#### Send Email Verification
```
POST /auth/verify/email/send
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Verification email sent"
}
```

#### Verify Email Code
```
POST /auth/verify/email/confirm
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "verificationCode": "123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "emailVerified": true
  },
  "message": "Email verified successfully"
}
```

### 5. Phone Verification

#### Send SMS Verification
```
POST /auth/verify/phone/send
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "phoneNumber": "+1234567890"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Verification SMS sent"
}
```

#### Verify Phone Code
```
POST /auth/verify/phone/confirm
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "phoneNumber": "+1234567890",
  "verificationCode": "123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "phoneVerified": true
  },
  "message": "Phone verified successfully"
}
```

## Profile Management Endpoints

### 6. User Profile

#### Get User Profile
```
GET /users/profile
```

**Headers:** `Authorization: Bearer {token}`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-v4",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "profileImage": "https://example.com/image.jpg",
      "dateOfBirth": "1990-01-01",
      "gender": "male",
      "location": {
        "city": "New York",
        "state": "NY",
        "country": "US"
      },
      "emailVerified": true,
      "phoneVerified": true,
      "profileComplete": true,
      "accountStatus": "active",
      "createdAt": "2025-08-30T12:00:00Z",
      "updatedAt": "2025-08-30T12:00:00Z"
    }
  }
}
```

#### Update User Profile
```
PUT /users/profile
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "dateOfBirth": "1990-01-01",
  "gender": "male",
  "location": {
    "city": "New York",
    "state": "NY",
    "country": "US"
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-v4",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "updatedAt": "2025-08-30T12:30:00Z"
    }
  },
  "message": "Profile updated successfully"
}
```

#### Upload Profile Image
```
POST /users/profile/image
```

**Headers:** 
- `Authorization: Bearer {token}`
- `Content-Type: multipart/form-data`

**Request Body:** FormData with `image` file

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "profileImage": "https://example.com/uploads/profile-images/uuid-v4.jpg"
  },
  "message": "Profile image uploaded successfully"
}
```

## Password Recovery Endpoints

### 7. Password Reset

#### Request Password Reset
```
POST /auth/password/reset-request
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset email sent"
}
```

#### Verify Reset Token
```
POST /auth/password/verify-token
```

**Request Body:**
```json
{
  "token": "reset-token",
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "tokenValid": true
  },
  "message": "Token is valid"
}
```

#### Reset Password
```
POST /auth/password/reset
```

**Request Body:**
```json
{
  "token": "reset-token",
  "email": "user@example.com",
  "newPassword": "NewSecurePass123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

#### Change Password (Authenticated)
```
PUT /auth/password/change
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewSecurePass123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

## Session Management Endpoints

### 8. Session Control

#### Get Active Sessions
```
GET /auth/sessions
```

**Headers:** `Authorization: Bearer {token}`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "session-uuid",
        "deviceInfo": "Chrome on Windows",
        "location": "New York, US",
        "ipAddress": "192.168.1.1",
        "isCurrentSession": true,
        "createdAt": "2025-08-30T12:00:00Z",
        "lastActivity": "2025-08-30T12:30:00Z"
      }
    ]
  }
}
```

#### Revoke Session
```
DELETE /auth/sessions/:sessionId
```

**Headers:** `Authorization: Bearer {token}`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Session revoked successfully"
}
```

#### Revoke All Sessions (Except Current)
```
DELETE /auth/sessions/all
```

**Headers:** `Authorization: Bearer {token}`

**Success Response (200):**
```json
{
  "success": true,
  "message": "All sessions revoked successfully"
}
```

## Account Status Endpoints

### 9. Account Management

#### Deactivate Account
```
PUT /users/account/deactivate
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "password": "SecurePass123!",
  "reason": "Taking a break"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Account deactivated successfully"
}
```

#### Reactivate Account
```
POST /auth/account/reactivate
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-v4",
      "accountStatus": "active"
    },
    "tokens": {
      "accessToken": "jwt-token",
      "refreshToken": "refresh-jwt-token"
    }
  },
  "message": "Account reactivated successfully"
}
```

#### Delete Account
```
DELETE /users/account
```

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "password": "SecurePass123!",
  "confirmationText": "DELETE"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

## Controllers and Business Logic

### AuthController
- **Location:** `src/auth/auth.controller.ts`
- **Responsibilities:**
  - Handle registration flow (basic, verification, profile)
  - Manage login/logout operations
  - Process OAuth callbacks
  - Password reset functionality
  - Session management

**Key Methods:**
- `registerBasic()`: Initial registration with email/password
- `verifyRegistration()`: Email/phone verification
- `completeProfile()`: Final registration step
- `login()`: User authentication
- `logout()`: Token invalidation
- `refreshToken()`: Token renewal
- `initiatePasswordReset()`: Send reset email
- `resetPassword()`: Complete password reset

### UserController
- **Location:** `src/users/users.controller.ts`
- **Responsibilities:**
  - Profile management operations
  - Account status changes
  - User data retrieval and updates

**Key Methods:**
- `getProfile()`: Retrieve user profile
- `updateProfile()`: Update profile information
- `uploadProfileImage()`: Handle image uploads
- `deactivateAccount()`: Account deactivation
- `deleteAccount()`: Account deletion

### VerificationController
- **Location:** `src/verification/verification.controller.ts`
- **Responsibilities:**
  - Email verification processes
  - SMS verification processes
  - Code generation and validation

**Key Methods:**
- `sendEmailVerification()`: Send email verification code
- `verifyEmailCode()`: Validate email code
- `sendSMSVerification()`: Send SMS verification code
- `verifySMSCode()`: Validate SMS code

### SessionController
- **Location:** `src/session/session.controller.ts`
- **Responsibilities:**
  - Active session management
  - Session revocation
  - Device tracking

**Key Methods:**
- `getActiveSessions()`: List user sessions
- `revokeSession()`: Terminate specific session
- `revokeAllSessions()`: Terminate all sessions

## Middleware and Guards

### AuthGuard
- **Location:** `src/auth/guards/auth.guard.ts`
- **Purpose:** JWT token validation
- **Usage:** `@UseGuards(AuthGuard)`

### RateLimitGuard
- **Location:** `src/common/guards/rate-limit.guard.ts`
- **Purpose:** API rate limiting
- **Configuration:** 100 requests/minute per IP

### ValidationPipe
- **Location:** `src/common/pipes/validation.pipe.ts`
- **Purpose:** Request body validation using class-validator

## Integration Points

### OAuth Providers
- **Google:** Passport-Google-OAuth20 strategy
- **Facebook:** Passport-Facebook strategy  
- **Apple:** Passport-Apple strategy

### SMS Service Integration
- **Provider:** Twilio
- **Configuration:** `src/config/twilio.config.ts`
- **Service:** `src/services/sms.service.ts`

### Email Service Integration
- **Provider:** SendGrid
- **Configuration:** `src/config/sendgrid.config.ts`
- **Service:** `src/services/email.service.ts`

### File Upload Integration
- **Provider:** AWS S3
- **Configuration:** `src/config/aws.config.ts`
- **Service:** `src/services/upload.service.ts`
- **Supported formats:** JPG, PNG, WebP
- **Max file size:** 5MB

### Location Services
- **Provider:** Google Places API
- **Service:** `src/services/location.service.ts`
- **Features:** City/state/country lookup

## Error Handling

### Standard Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": []
  }
}
```

### Common Error Codes
- `VALIDATION_ERROR`: Input validation failed
- `INVALID_CREDENTIALS`: Authentication failed
- `TOKEN_EXPIRED`: JWT token expired
- `UNAUTHORIZED`: Access denied
- `NOT_FOUND`: Resource not found
- `RATE_LIMITED`: Too many requests
- `EMAIL_EXISTS`: Email already registered
- `PHONE_EXISTS`: Phone number already registered
- `ACCOUNT_DEACTIVATED`: Account is deactivated
- `ACCOUNT_DELETED`: Account has been deleted
- `VERIFICATION_FAILED`: Code verification failed
- `UPLOAD_ERROR`: File upload failed

### HTTP Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `429`: Too Many Requests
- `500`: Internal Server Error

## Security Considerations

### Authentication
- JWT tokens with 15-minute expiry
- Refresh tokens with 7-day expiry
- Secure HTTP-only cookies for web clients

### Rate Limiting
- Global: 100 requests/minute per IP
- Authentication: 10 attempts/minute per IP
- Password reset: 3 requests/hour per email

### Data Validation
- Input sanitization using class-validator
- SQL injection prevention via TypeORM
- XSS protection with helmet middleware

### CORS Configuration
- Allowed origins from environment variables
- Credentials support for authenticated requests
- Preflight request handling