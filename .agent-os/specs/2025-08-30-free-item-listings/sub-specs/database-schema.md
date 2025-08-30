# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2025-08-30-free-item-listings/spec.md

> Created: 2025-08-30
> Version: 1.0.0

## Schema Changes

### New Tables

#### 1. items Table
Primary table for storing free item listings.

```sql
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category_id INTEGER,
    condition VARCHAR(50) NOT NULL DEFAULT 'good', -- enum: excellent, good, fair, poor
    location geography(POINT, 4326),
    location_text VARCHAR(255),
    zip_code VARCHAR(10),
    is_available BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    claimed_at TIMESTAMP WITH TIME ZONE,
    claimed_by_user_id INTEGER,
    pickup_notes TEXT,
    
    CONSTRAINT fk_items_user_id 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_items_category_id 
        FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE SET NULL,
    CONSTRAINT fk_items_claimed_by_user_id 
        FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT check_expires_at_future 
        CHECK (expires_at > created_at)
);

-- Indexes for performance
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_category_id ON items(category_id);
CREATE INDEX idx_items_location ON items USING GIST(location);
CREATE INDEX idx_items_zip_code ON items(zip_code);
CREATE INDEX idx_items_available_expires ON items(is_available, expires_at);
CREATE INDEX idx_items_created_at ON items(created_at DESC);
CREATE INDEX idx_items_claimed_by ON items(claimed_by_user_id);
```

#### 2. item_categories Table
Optional categorization system for items.

```sql
CREATE TABLE item_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    parent_id INTEGER,
    icon_url VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_item_categories_parent_id 
        FOREIGN KEY (parent_id) REFERENCES item_categories(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_item_categories_parent_id ON item_categories(parent_id);
CREATE INDEX idx_item_categories_active_sort ON item_categories(is_active, sort_order);
```

#### 3. item_images Table
Multiple images per item listing with S3 integration.

```sql
CREATE TABLE item_images (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    s3_bucket VARCHAR(100) NOT NULL,
    original_filename VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    width INTEGER,
    height INTEGER,
    is_primary BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_item_images_item_id 
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    CONSTRAINT unique_primary_per_item 
        UNIQUE (item_id, is_primary) DEFERRABLE INITIALLY DEFERRED
);

-- Indexes
CREATE INDEX idx_item_images_item_id ON item_images(item_id);
CREATE INDEX idx_item_images_s3_key ON item_images(s3_key);
CREATE INDEX idx_item_images_primary_sort ON item_images(item_id, is_primary DESC, sort_order);
```

#### 4. item_claims Table
FIFO queue system for managing item claims with user preferences.

```sql
CREATE TABLE item_claims (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    claimer_user_id INTEGER NOT NULL,
    claim_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- enum: pending, approved, rejected, expired, cancelled
    claim_message TEXT,
    priority_score INTEGER DEFAULT 0,
    distance_miles DECIMAL(8,2),
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    pickup_scheduled_at TIMESTAMP WITH TIME ZONE,
    pickup_completed_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT fk_item_claims_item_id 
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    CONSTRAINT fk_item_claims_claimer_user_id 
        FOREIGN KEY (claimer_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_pending_claim_per_user_item 
        UNIQUE (item_id, claimer_user_id, claim_status) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT check_expires_at_future 
        CHECK (expires_at > claimed_at)
);

-- Indexes for FIFO queue performance
CREATE INDEX idx_item_claims_item_status_time ON item_claims(item_id, claim_status, claimed_at);
CREATE INDEX idx_item_claims_user_id ON item_claims(claimer_user_id);
CREATE INDEX idx_item_claims_status_expires ON item_claims(claim_status, expires_at);
CREATE INDEX idx_item_claims_priority_time ON item_claims(item_id, priority_score DESC, claimed_at);
```

#### 5. user_item_preferences Table
User preferences for item filtering and notifications.

```sql
CREATE TABLE user_item_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    preferred_categories INTEGER[],
    max_distance_miles INTEGER DEFAULT 25,
    notification_enabled BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    push_notifications BOOLEAN DEFAULT false,
    preferred_pickup_days VARCHAR(20)[], -- array of days: monday, tuesday, etc.
    preferred_pickup_times VARCHAR(50), -- e.g., "morning", "afternoon", "evening"
    auto_claim_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT fk_user_item_preferences_user_id 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_preferences_per_user 
        UNIQUE (user_id)
);

-- Indexes
CREATE INDEX idx_user_item_preferences_user_id ON user_item_preferences(user_id);
CREATE INDEX idx_user_item_preferences_notifications ON user_item_preferences(notification_enabled, email_notifications);
```

### TypeORM Entity Definitions

Based on the existing User entity patterns, here are the corresponding TypeORM entities:

#### Item Entity
```typescript
@Entity('items')
@Index(['isAvailable', 'expiresAt'])
@Index(['userId'])
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'category_id', nullable: true })
  categoryId: number;

  @Column({
    type: 'enum',
    enum: ItemCondition,
    default: ItemCondition.GOOD
  })
  condition: ItemCondition;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true
  })
  location: string;

  @Column({ name: 'location_text', nullable: true })
  locationText: string;

  @Column({ name: 'zip_code', length: 10, nullable: true })
  zipCode: string;

  @Column({ name: 'is_available', default: true })
  isAvailable: boolean;

  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'claimed_at', type: 'timestamp with time zone', nullable: true })
  claimedAt: Date;

  @Column({ name: 'claimed_by_user_id', nullable: true })
  claimedByUserId: number;

  @Column({ name: 'pickup_notes', type: 'text', nullable: true })
  pickupNotes: string;

  // Relationships
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => ItemCategory, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: ItemCategory;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'claimed_by_user_id' })
  claimedByUser: User;

  @OneToMany(() => ItemImage, image => image.item)
  images: ItemImage[];

  @OneToMany(() => ItemClaim, claim => claim.item)
  claims: ItemClaim[];
}
```

## Migrations

### Migration 001: Create Base Tables
```sql
-- Create item_categories table first (referenced by items)
CREATE TABLE item_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    parent_id INTEGER,
    icon_url VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key constraint after table creation
ALTER TABLE item_categories 
ADD CONSTRAINT fk_item_categories_parent_id 
FOREIGN KEY (parent_id) REFERENCES item_categories(id) ON DELETE CASCADE;

-- Create items table
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category_id INTEGER,
    condition VARCHAR(50) NOT NULL DEFAULT 'good',
    location geography(POINT, 4326),
    location_text VARCHAR(255),
    zip_code VARCHAR(10),
    is_available BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    claimed_at TIMESTAMP WITH TIME ZONE,
    claimed_by_user_id INTEGER,
    pickup_notes TEXT
);

-- Add constraints
ALTER TABLE items ADD CONSTRAINT fk_items_user_id 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE items ADD CONSTRAINT fk_items_category_id 
    FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE SET NULL;
ALTER TABLE items ADD CONSTRAINT fk_items_claimed_by_user_id 
    FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE items ADD CONSTRAINT check_expires_at_future 
    CHECK (expires_at > created_at);
```

### Migration 002: Create Supporting Tables
```sql
-- Create item_images table
CREATE TABLE item_images (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    s3_bucket VARCHAR(100) NOT NULL,
    original_filename VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    width INTEGER,
    height INTEGER,
    is_primary BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE item_images ADD CONSTRAINT fk_item_images_item_id 
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;

-- Create item_claims table
CREATE TABLE item_claims (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    claimer_user_id INTEGER NOT NULL,
    claim_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    claim_message TEXT,
    priority_score INTEGER DEFAULT 0,
    distance_miles DECIMAL(8,2),
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    pickup_scheduled_at TIMESTAMP WITH TIME ZONE,
    pickup_completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE item_claims ADD CONSTRAINT fk_item_claims_item_id 
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;
ALTER TABLE item_claims ADD CONSTRAINT fk_item_claims_claimer_user_id 
    FOREIGN KEY (claimer_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE item_claims ADD CONSTRAINT check_expires_at_future 
    CHECK (expires_at > claimed_at);

-- Create user_item_preferences table
CREATE TABLE user_item_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    preferred_categories INTEGER[],
    max_distance_miles INTEGER DEFAULT 25,
    notification_enabled BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    push_notifications BOOLEAN DEFAULT false,
    preferred_pickup_days VARCHAR(20)[],
    preferred_pickup_times VARCHAR(50),
    auto_claim_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE user_item_preferences ADD CONSTRAINT fk_user_item_preferences_user_id 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_item_preferences ADD CONSTRAINT unique_preferences_per_user 
    UNIQUE (user_id);
```

### Migration 003: Create Indexes
```sql
-- Items table indexes
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_category_id ON items(category_id);
CREATE INDEX idx_items_location ON items USING GIST(location);
CREATE INDEX idx_items_zip_code ON items(zip_code);
CREATE INDEX idx_items_available_expires ON items(is_available, expires_at);
CREATE INDEX idx_items_created_at ON items(created_at DESC);
CREATE INDEX idx_items_claimed_by ON items(claimed_by_user_id);

-- Item categories indexes
CREATE INDEX idx_item_categories_parent_id ON item_categories(parent_id);
CREATE INDEX idx_item_categories_active_sort ON item_categories(is_active, sort_order);

-- Item images indexes
CREATE INDEX idx_item_images_item_id ON item_images(item_id);
CREATE INDEX idx_item_images_s3_key ON item_images(s3_key);
CREATE INDEX idx_item_images_primary_sort ON item_images(item_id, is_primary DESC, sort_order);

-- Item claims indexes (critical for FIFO performance)
CREATE INDEX idx_item_claims_item_status_time ON item_claims(item_id, claim_status, claimed_at);
CREATE INDEX idx_item_claims_user_id ON item_claims(claimer_user_id);
CREATE INDEX idx_item_claims_status_expires ON item_claims(claim_status, expires_at);
CREATE INDEX idx_item_claims_priority_time ON item_claims(item_id, priority_score DESC, claimed_at);

-- User preferences indexes
CREATE INDEX idx_user_item_preferences_user_id ON user_item_preferences(user_id);
CREATE INDEX idx_user_item_preferences_notifications ON user_item_preferences(notification_enabled, email_notifications);
```

### Migration 004: Add Unique Constraints
```sql
-- Ensure only one primary image per item
CREATE UNIQUE INDEX idx_item_images_unique_primary 
ON item_images (item_id) 
WHERE is_primary = true;

-- Prevent duplicate pending claims from same user for same item
CREATE UNIQUE INDEX idx_item_claims_unique_pending 
ON item_claims (item_id, claimer_user_id) 
WHERE claim_status = 'pending';
```

## Rationale

### FIFO Queue Implementation
The `item_claims` table implements a FIFO (First In, First Out) queue system with the following design decisions:

1. **Time-based Ordering**: Primary sorting by `claimed_at` timestamp ensures true FIFO behavior
2. **Priority System**: Optional `priority_score` allows for weighted queuing (e.g., local users get slight priority)
3. **Status Management**: Comprehensive status tracking (`pending`, `approved`, `rejected`, `expired`, `cancelled`) enables proper queue state management
4. **Expiration Handling**: Claims automatically expire after a set time to prevent indefinite queue blocking
5. **Multiple Claims**: Users can claim multiple items simultaneously, but only one pending claim per item per user

### Location Storage Strategy
Following the existing User entity pattern for location handling:

1. **PostGIS Integration**: Using `geography(POINT, 4326)` type for precise location storage and distance calculations
2. **Dual Storage**: Both geographic coordinates and text representation for flexibility
3. **Zip Code Indexing**: Separate zip code field for fast regional filtering
4. **Spatial Indexing**: GIST index on location column for efficient proximity queries

### Image Handling with S3 Integration
Designed for scalable image storage and management:

1. **S3 References**: Store S3 key and bucket instead of direct URLs for flexibility
2. **Metadata Storage**: File size, dimensions, and MIME type for client optimization
3. **Primary Image**: Boolean flag with unique constraint ensures one primary image per item
4. **Sort Ordering**: Manual ordering capability for image galleries
5. **Cascade Deletion**: Images are automatically cleaned up when items are deleted

### Data Integrity and Performance Considerations

#### Data Integrity
1. **Foreign Key Constraints**: All relationships properly constrained with appropriate cascade behaviors
2. **Check Constraints**: Business logic enforced at database level (e.g., expiration dates must be future)
3. **Unique Constraints**: Prevent duplicate claims and ensure data consistency
4. **NOT NULL Constraints**: Essential fields marked as required

#### Performance Optimizations
1. **Composite Indexes**: Multi-column indexes for common query patterns
2. **Partial Indexes**: Unique constraints only where needed (e.g., primary images, pending claims)
3. **GIST Indexes**: Spatial indexes for location-based queries
4. **Array Indexes**: Support for user preference arrays with GIN indexes if needed

#### Scalability Considerations
1. **Partitioning Ready**: Table structure supports future partitioning by date or location
2. **Archive Strategy**: Expired items can be moved to archive tables
3. **Index Maintenance**: Indexes designed to minimize maintenance overhead
4. **Query Optimization**: Index design supports efficient filtering, sorting, and joining patterns

### Integration with Existing System
This schema integrates seamlessly with the existing user authentication and session management:

1. **User Relationships**: All user references use the existing `users.id` primary key
2. **Naming Conventions**: Follows existing snake_case naming for database columns
3. **TypeORM Patterns**: Entity definitions match existing patterns with decorators and relationships
4. **Timestamp Handling**: Uses same timestamp patterns as existing entities
5. **Location Handling**: Extends the existing User location storage pattern