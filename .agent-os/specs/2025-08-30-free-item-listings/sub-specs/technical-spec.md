# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-08-30-free-item-listings/spec.md

> Created: 2025-08-30
> Version: 1.0.0

## Technical Requirements

### Item Listing Management System

**Database Schema:**
- `free_items` table with fields:
  - `id` (UUID, primary key)
  - `user_id` (UUID, foreign key to users table)
  - `title` (VARCHAR, 255 characters max)
  - `description` (TEXT)
  - `category_id` (UUID, foreign key to categories table)
  - `condition` (ENUM: excellent, good, fair, poor)
  - `zip_code` (VARCHAR, 10 characters)
  - `pickup_address` (TEXT, encrypted)
  - `pickup_instructions` (TEXT)
  - `images` (JSON array of S3 keys)
  - `status` (ENUM: available, claimed, expired, removed)
  - `expires_at` (TIMESTAMP)
  - `created_at` (TIMESTAMP)
  - `updated_at` (TIMESTAMP)

**API Endpoints:**
- `POST /api/free-items` - Create new item listing (authenticated)
- `GET /api/free-items` - List available items with filters (public)
- `GET /api/free-items/:id` - Get item details (public)
- `PUT /api/free-items/:id` - Update item listing (authenticated, owner only)
- `DELETE /api/free-items/:id` - Remove item listing (authenticated, owner only)

### FIFO Queue Implementation for Claims

**Database Schema:**
- `item_claims` table with fields:
  - `id` (UUID, primary key)
  - `item_id` (UUID, foreign key to free_items)
  - `claimer_id` (UUID, foreign key to users table)
  - `claim_position` (INTEGER, auto-increment per item)
  - `status` (ENUM: pending, confirmed, cancelled, expired)
  - `claimed_at` (TIMESTAMP)
  - `expires_at` (TIMESTAMP, 24 hours from claim)

**Implementation:**
- Use database-level constraints to ensure claim ordering
- Automatic position assignment using MAX(claim_position) + 1
- Background job to process expired claims and advance queue
- Real-time notifications for position updates

### Image Upload Integration

**S3 Integration:**
- Leverage existing S3 service configuration
- Bucket: `frauc-free-items-images`
- Image processing pipeline:
  - Resize to max 1200px width/height
  - Convert to WebP format for optimization
  - Generate thumbnails (300px)
- Maximum 5 images per listing
- 10MB size limit per image

**API Endpoints:**
- `POST /api/free-items/:id/images` - Upload images
- `DELETE /api/free-items/:id/images/:imageId` - Remove image

### Location-Based Filtering

**Implementation:**
- Primary filter by exact zip code match
- Secondary filter by zip code radius (5, 10, 25, 50 miles)
- Use existing zip code distance calculation service
- Cache distance calculations in Redis for performance

**Database Indexing:**
- Composite index on (status, zip_code, created_at)
- Spatial index for coordinates (if lat/lng added later)

### Search and Filtering Capabilities

**Search Features:**
- Full-text search on title and description using PostgreSQL tsvector
- Category-based filtering
- Condition-based filtering
- Date range filtering (created within last 7/30 days)
- Sort options: newest, oldest, alphabetical

**Performance Requirements:**
- Search queries must complete under 200ms
- Pagination with 20 items per page
- Use database indexes and query optimization

### Email/SMS Notification System

**Notification Types:**
- Item claimed notification to owner
- Claim position updates to claimers
- Item available again (if claim expires)
- Pickup reminder (24 hours before claim expires)

**Integration:**
- Leverage existing email service (SendGrid/SES)
- Leverage existing SMS service (Twilio)
- Use existing notification preferences from user settings
- Queue notifications using existing job system

### Authentication Integration

**Public Access:**
- Browse listings without authentication
- View item details without authentication
- Search and filter without authentication

**Authenticated Actions:**
- Create item listings
- Claim items
- Manage own listings
- View claim history
- Update notification preferences

**Integration Points:**
- Use existing JWT authentication middleware
- Integrate with existing user roles and permissions
- Respect existing user privacy settings

### Expiration Mechanism

**14-Day Auto-Expiration:**
- Automatic status change from 'available' to 'expired'
- Background job runs daily at midnight
- Owner notification 2 days before expiration
- Option to extend listing for additional 14 days (max 2 extensions)

**Claim Expiration (24 hours):**
- Automatic advancement of claim queue
- Notification to next claimer in queue
- Background job runs every hour to process expired claims

## Approach

### Development Strategy

1. **Phase 1: Core Listing System**
   - Database schema creation and migrations
   - Basic CRUD operations for items
   - Image upload integration
   - Public browsing functionality

2. **Phase 2: Claiming System**
   - FIFO queue implementation
   - Claim management endpoints
   - Basic notifications

3. **Phase 3: Enhanced Features**
   - Advanced search and filtering
   - Location-based features
   - Comprehensive notification system

4. **Phase 4: Optimization**
   - Performance tuning
   - Caching implementation
   - Mobile responsiveness

### Performance Considerations

- **Database Optimization:**
  - Proper indexing strategy
  - Query optimization for search operations
  - Connection pooling

- **Caching Strategy:**
  - Redis caching for frequent searches
  - Image CDN for fast loading
  - API response caching for public endpoints

- **Scalability:**
  - Background job processing for notifications
  - Image processing in separate service
  - Database read replicas for search queries

### Security Measures

- **Data Protection:**
  - Encrypt pickup addresses at rest
  - Rate limiting on API endpoints
  - Input validation and sanitization
  - SQL injection prevention

- **Privacy Controls:**
  - Anonymous browsing support
  - User control over contact information sharing
  - GDPR compliance for data handling

## External Dependencies

**No new external dependencies required** - The implementation will build entirely on the existing technology stack:

- **Backend:** NestJS with TypeORM
- **Database:** PostgreSQL (existing)
- **File Storage:** AWS S3 (existing service)
- **Authentication:** Existing JWT-based system
- **Notifications:** Existing email/SMS services
- **Job Queue:** Existing background job system
- **Caching:** Redis (if not already in use, minimal setup required)

**Potential Future Dependencies:**
- Elasticsearch (if full-text search performance becomes insufficient)
- Geographic data service (for enhanced location features)
- Push notification service (for mobile app integration)

## Integration Requirements

### Existing Frauc Authentication System

- Utilize existing user authentication middleware
- Respect current user session management
- Integrate with existing user profile data
- Maintain consistency with current authorization patterns
- Use existing password reset and email verification flows

### Database Integration

- Follow existing database migration patterns
- Use current TypeORM entity conventions
- Maintain foreign key relationships with users table
- Follow existing data validation patterns

### API Integration

- Follow existing API versioning strategy
- Use current error handling patterns
- Maintain consistency with existing response formats
- Integrate with existing logging and monitoring