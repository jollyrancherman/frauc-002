# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2025-08-30-user-auth-system/spec.md

> Created: 2025-08-30
> Version: 1.0.0

## Schema Changes

### New Tables

#### 1. users table
The primary user accounts table storing core user information and authentication data.

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255), -- NULL for social-only accounts
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    profile_image_url TEXT,
    location GEOGRAPHY(POINT, 4326), -- PostGIS for lat/lng storage
    location_text VARCHAR(255), -- Human-readable location
    account_status VARCHAR(50) DEFAULT 'pending_verification' 
        CHECK (account_status IN ('active', 'deactivated', 'pending_verification', 'suspended')),
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT users_contact_required CHECK (email IS NOT NULL OR phone IS NOT NULL),
    CONSTRAINT users_auth_method_required CHECK (password_hash IS NOT NULL OR EXISTS (
        SELECT 1 FROM social_auth_providers sap WHERE sap.user_id = id
    ))
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_account_status ON users(account_status);
CREATE INDEX idx_users_location ON users USING GIST(location);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_login ON users(last_login_at);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### 2. user_verifications table
Tracks verification attempts and status for phone and email verification.

```sql
CREATE TABLE user_verifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    verification_type VARCHAR(20) NOT NULL CHECK (verification_type IN ('email', 'phone')),
    verification_value VARCHAR(255) NOT NULL, -- email or phone number being verified
    verification_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent multiple active verifications for same type/user
    UNIQUE(user_id, verification_type, verification_value, verified_at)
);

-- Indexes
CREATE INDEX idx_user_verifications_user_id ON user_verifications(user_id);
CREATE INDEX idx_user_verifications_code ON user_verifications(verification_code);
CREATE INDEX idx_user_verifications_expires_at ON user_verifications(expires_at);
CREATE INDEX idx_user_verifications_type_value ON user_verifications(verification_type, verification_value);
```

#### 3. user_sessions table
Manages user sessions for authentication (if not using Redis-only approach).

```sql
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_info JSONB, -- Store device/browser info
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active, expires_at);
CREATE INDEX idx_user_sessions_last_activity ON user_sessions(last_activity_at);
```

#### 4. password_reset_tokens table
Manages password reset tokens for secure password recovery.

```sql
CREATE TABLE password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    
    -- Only allow one active token per user
    CONSTRAINT unique_active_reset_token UNIQUE(user_id, used_at) DEFERRABLE INITIALLY DEFERRED
);

-- Indexes
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
```

#### 5. social_auth_providers table
Links user accounts to OAuth providers (Google, Apple, Facebook, etc.).

```sql
CREATE TABLE social_auth_providers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_name VARCHAR(50) NOT NULL CHECK (provider_name IN ('google', 'apple', 'facebook', 'twitter')),
    provider_user_id VARCHAR(255) NOT NULL, -- Provider's unique ID for user
    provider_email VARCHAR(255),
    provider_data JSONB, -- Store additional provider data
    access_token_hash VARCHAR(255), -- Hashed access token
    refresh_token_hash VARCHAR(255), -- Hashed refresh token
    token_expires_at TIMESTAMP WITH TIME ZONE,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate provider connections
    UNIQUE(provider_name, provider_user_id),
    -- Prevent same provider connected multiple times to same user
    UNIQUE(user_id, provider_name)
);

-- Indexes
CREATE INDEX idx_social_auth_providers_user_id ON social_auth_providers(user_id);
CREATE INDEX idx_social_auth_providers_provider ON social_auth_providers(provider_name, provider_user_id);
CREATE INDEX idx_social_auth_providers_email ON social_auth_providers(provider_email);
```

### Table Modifications

#### Future-proofing for user references
Prepare for adding user references to other tables in the system:

```sql
-- Example: When listings table is created, it should reference users
-- This is a placeholder for future schema changes
/*
ALTER TABLE listings 
ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE bids 
ADD COLUMN bidder_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
*/
```

## Migrations

### Migration 001: Create user authentication tables

```sql
-- Migration: 001_create_user_auth_tables.sql
-- Description: Create all user authentication and profile tables

BEGIN;

-- Enable PostGIS extension for geography support
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    profile_image_url TEXT,
    location GEOGRAPHY(POINT, 4326),
    location_text VARCHAR(255),
    account_status VARCHAR(50) DEFAULT 'pending_verification' 
        CHECK (account_status IN ('active', 'deactivated', 'pending_verification', 'suspended')),
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT users_contact_required CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Create user_verifications table
CREATE TABLE user_verifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    verification_type VARCHAR(20) NOT NULL CHECK (verification_type IN ('email', 'phone')),
    verification_value VARCHAR(255) NOT NULL,
    verification_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, verification_type, verification_value, verified_at)
);

-- Create user_sessions table
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create password_reset_tokens table
CREATE TABLE password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    
    CONSTRAINT unique_active_reset_token UNIQUE(user_id, used_at) DEFERRABLE INITIALLY DEFERRED
);

-- Create social_auth_providers table
CREATE TABLE social_auth_providers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_name VARCHAR(50) NOT NULL CHECK (provider_name IN ('google', 'apple', 'facebook', 'twitter')),
    provider_user_id VARCHAR(255) NOT NULL,
    provider_email VARCHAR(255),
    provider_data JSONB,
    access_token_hash VARCHAR(255),
    refresh_token_hash VARCHAR(255),
    token_expires_at TIMESTAMP WITH TIME ZONE,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(provider_name, provider_user_id),
    UNIQUE(user_id, provider_name)
);

COMMIT;
```

### Migration 002: Create indexes and triggers

```sql
-- Migration: 002_create_indexes_and_triggers.sql
-- Description: Add performance indexes and utility triggers

BEGIN;

-- Users table indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_account_status ON users(account_status);
CREATE INDEX idx_users_location ON users USING GIST(location);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_last_login ON users(last_login_at);

-- User verifications indexes
CREATE INDEX idx_user_verifications_user_id ON user_verifications(user_id);
CREATE INDEX idx_user_verifications_code ON user_verifications(verification_code);
CREATE INDEX idx_user_verifications_expires_at ON user_verifications(expires_at);
CREATE INDEX idx_user_verifications_type_value ON user_verifications(verification_type, verification_value);

-- User sessions indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active, expires_at);
CREATE INDEX idx_user_sessions_last_activity ON user_sessions(last_activity_at);

-- Password reset tokens indexes
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- Social auth providers indexes
CREATE INDEX idx_social_auth_providers_user_id ON social_auth_providers(user_id);
CREATE INDEX idx_social_auth_providers_provider ON social_auth_providers(provider_name, provider_user_id);
CREATE INDEX idx_social_auth_providers_email ON social_auth_providers(provider_email);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
```

### Migration 003: Create cleanup procedures

```sql
-- Migration: 003_create_cleanup_procedures.sql
-- Description: Create stored procedures for data cleanup and maintenance

BEGIN;

-- Procedure to clean up expired verification codes
CREATE OR REPLACE FUNCTION cleanup_expired_verifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_verifications 
    WHERE expires_at < NOW() AND verified_at IS NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Procedure to clean up expired password reset tokens
CREATE OR REPLACE FUNCTION cleanup_expired_reset_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM password_reset_tokens 
    WHERE expires_at < NOW() AND used_at IS NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Procedure to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions 
    WHERE expires_at < NOW() OR is_active = FALSE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get user profile with verification status
CREATE OR REPLACE FUNCTION get_user_profile(input_user_id INTEGER)
RETURNS TABLE(
    user_id INTEGER,
    email VARCHAR(255),
    phone VARCHAR(20),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    profile_image_url TEXT,
    location_text VARCHAR(255),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    account_status VARCHAR(50),
    email_verified BOOLEAN,
    phone_verified BOOLEAN,
    social_providers TEXT[],
    created_at TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.email,
        u.phone,
        u.first_name,
        u.last_name,
        u.profile_image_url,
        u.location_text,
        ST_Y(u.location::geometry) as latitude,
        ST_X(u.location::geometry) as longitude,
        u.account_status,
        u.email_verified,
        u.phone_verified,
        ARRAY_AGG(DISTINCT sap.provider_name) FILTER (WHERE sap.provider_name IS NOT NULL) as social_providers,
        u.created_at,
        u.last_login_at
    FROM users u
    LEFT JOIN social_auth_providers sap ON u.id = sap.user_id
    WHERE u.id = input_user_id
    GROUP BY u.id, u.email, u.phone, u.first_name, u.last_name, 
             u.profile_image_url, u.location_text, u.location, 
             u.account_status, u.email_verified, u.phone_verified,
             u.created_at, u.last_login_at;
END;
$$ LANGUAGE plpgsql;

COMMIT;
```

## Performance Considerations

### Indexing Strategy

**Authentication Queries:**
- `idx_users_email` and `idx_users_phone`: Critical for login operations
- `idx_user_sessions_token`: Essential for session validation
- `idx_social_auth_providers_provider`: Optimizes OAuth provider lookups

**Geographic Queries:**
- `idx_users_location` (GIST): Enables efficient location-based searches
- PostGIS geography type provides accurate distance calculations

**Cleanup Operations:**
- Indexes on `expires_at` fields enable efficient cleanup of expired data
- Composite indexes on status fields optimize filtered queries

### Query Optimization

**Session Management:**
- Use composite index `idx_user_sessions_active` for finding active, non-expired sessions
- Regular cleanup of expired sessions prevents table bloat

**Verification Lookups:**
- Composite index on `verification_type` and `verification_value` optimizes verification checks
- Separate indexes on user_id and expires_at support cleanup operations

## Data Integrity Rules

### Referential Integrity
- All user-related tables use `ON DELETE CASCADE` to maintain consistency
- Foreign key constraints ensure data relationships remain valid

### Business Logic Constraints
- Users must have either email or phone (enforced by CHECK constraint)
- Users must have either password hash or social provider connection
- Account status limited to valid values via CHECK constraint
- Unique constraints prevent duplicate social provider connections

### Data Validation
- Email and phone uniqueness enforced at database level
- Verification codes have attempt limits to prevent brute force attacks
- Password reset tokens are single-use via unique constraint

## Security Considerations

### Sensitive Data Protection
- Password hashes stored using secure hashing algorithms (bcrypt/Argon2)
- OAuth tokens stored as hashes, not plain text
- Session tokens are UUIDs with sufficient entropy
- IP addresses logged for security auditing

### Access Control
- No direct password storage - only hashed values
- Verification codes have expiration and attempt limits
- Session management includes device tracking for security

### Data Cleanup
- Automated cleanup procedures prevent accumulation of expired sensitive data
- Expired verification codes and reset tokens are regularly purged
- Session cleanup prevents indefinite storage of user activity data

### Audit Trail
- Timestamps on all critical operations (login, verification, password reset)
- IP address logging for security events
- Device information captured for session management

This schema provides a robust foundation for the user authentication system with proper security, performance optimization, and data integrity measures.