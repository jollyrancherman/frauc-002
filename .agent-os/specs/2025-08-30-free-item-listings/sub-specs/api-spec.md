# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-08-30-free-item-listings/spec.md

> Created: 2025-08-30
> Version: 1.0.0

## Endpoints

### Items Controller (`/items`)

#### Create Item Listing
- **POST** `/items`
- **Authentication:** Required (JWT)
- **Description:** Create a new item listing
- **Request Body:**
```typescript
{
  title: string;
  description: string;
  categoryId: number;
  condition: 'excellent' | 'good' | 'fair' | 'poor';
  pickupLocation: string;
  pickupInstructions?: string;
  availableUntil?: Date;
  tags?: string[];
  images?: string[]; // Base64 encoded or file references
}
```
- **Response:** `201 Created`
```typescript
{
  id: number;
  title: string;
  description: string;
  categoryId: number;
  condition: string;
  pickupLocation: string;
  pickupInstructions: string;
  availableUntil: Date;
  status: 'available';
  postedAt: Date;
  updatedAt: Date;
  userId: number;
  queueCount: number;
  tags: string[];
  images: ItemImage[];
}
```
- **Error Responses:**
  - `400 Bad Request` - Invalid input data
  - `401 Unauthorized` - Invalid or missing JWT token
  - `413 Payload Too Large` - Too many images or images too large

#### Get Items (Search/Browse)
- **GET** `/items`
- **Authentication:** Optional (anonymous browsing allowed)
- **Description:** Search and browse item listings
- **Query Parameters:**
```typescript
{
  search?: string;           // Search in title/description
  categoryId?: number;       // Filter by category
  condition?: string[];      // Filter by condition
  tags?: string[];          // Filter by tags
  location?: string;        // Location-based filtering
  radius?: number;          // Search radius in miles (requires location)
  status?: 'available' | 'claimed' | 'expired';
  sortBy?: 'newest' | 'oldest' | 'alphabetical' | 'distance';
  page?: number;            // Default: 1
  limit?: number;           // Default: 20, Max: 100
}
```
- **Response:** `200 OK`
```typescript
{
  items: ItemSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    categories: Category[];
    availableConditions: string[];
    availableTags: string[];
  };
}
```

#### Get Item Details
- **GET** `/items/:id`
- **Authentication:** Optional
- **Description:** Get detailed information about a specific item
- **Response:** `200 OK`
```typescript
{
  id: number;
  title: string;
  description: string;
  categoryId: number;
  category: Category;
  condition: string;
  pickupLocation: string;
  pickupInstructions: string;
  availableUntil: Date;
  status: string;
  postedAt: Date;
  updatedAt: Date;
  userId: number;
  poster: {
    id: number;
    username: string;
    profileImageUrl?: string;
    joinedAt: Date;
    itemsPosted: number;
    rating: number;
  };
  queueCount: number;
  userPosition?: number; // Only if authenticated user is in queue
  tags: string[];
  images: ItemImage[];
  isOwner: boolean; // Only if authenticated
}
```
- **Error Responses:**
  - `404 Not Found` - Item does not exist

#### Update Item Listing
- **PUT** `/items/:id`
- **Authentication:** Required (JWT, must be owner)
- **Description:** Update an existing item listing
- **Request Body:** Same as create, but all fields optional
- **Response:** `200 OK` - Updated item object
- **Error Responses:**
  - `400 Bad Request` - Invalid input data
  - `401 Unauthorized` - Invalid or missing JWT token
  - `403 Forbidden` - Not the owner of the item
  - `404 Not Found` - Item does not exist
  - `409 Conflict` - Cannot update item that has been claimed

#### Delete Item Listing
- **DELETE** `/items/:id`
- **Authentication:** Required (JWT, must be owner)
- **Description:** Delete an item listing
- **Response:** `204 No Content`
- **Error Responses:**
  - `401 Unauthorized` - Invalid or missing JWT token
  - `403 Forbidden` - Not the owner of the item
  - `404 Not Found` - Item does not exist
  - `409 Conflict` - Cannot delete item with active claims

#### Get My Items
- **GET** `/items/my-items`
- **Authentication:** Required (JWT)
- **Description:** Get all items posted by the authenticated user
- **Query Parameters:**
```typescript
{
  status?: 'available' | 'claimed' | 'expired' | 'all';
  page?: number;
  limit?: number;
}
```
- **Response:** `200 OK` - Paginated list of user's items

### Claims Controller (`/items/:itemId/claims`)

#### Join Claim Queue
- **POST** `/items/:itemId/claims`
- **Authentication:** Required (JWT)
- **Description:** Join the queue to claim an item
- **Request Body:**
```typescript
{
  message?: string; // Optional message to the poster
}
```
- **Response:** `201 Created`
```typescript
{
  id: number;
  itemId: number;
  userId: number;
  position: number;
  message?: string;
  status: 'pending';
  createdAt: Date;
}
```
- **Error Responses:**
  - `400 Bad Request` - Already in queue or item not available
  - `401 Unauthorized` - Invalid or missing JWT token
  - `403 Forbidden` - Cannot claim own item
  - `404 Not Found` - Item does not exist

#### Get Queue Position
- **GET** `/items/:itemId/claims/my-position`
- **Authentication:** Required (JWT)
- **Description:** Get user's current position in the claim queue
- **Response:** `200 OK`
```typescript
{
  position: number;
  estimatedWaitTime?: string;
  status: 'pending' | 'selected' | 'cancelled';
  createdAt: Date;
}
```
- **Error Responses:**
  - `404 Not Found` - User not in queue or item doesn't exist

#### Cancel Claim
- **DELETE** `/items/:itemId/claims`
- **Authentication:** Required (JWT)
- **Description:** Remove user from claim queue
- **Response:** `204 No Content`
- **Error Responses:**
  - `404 Not Found` - User not in queue or item doesn't exist

#### Get Item Queue (Owner Only)
- **GET** `/items/:itemId/claims`
- **Authentication:** Required (JWT, must be item owner)
- **Description:** View all users in the claim queue
- **Response:** `200 OK`
```typescript
{
  claims: {
    id: number;
    userId: number;
    user: {
      id: number;
      username: string;
      profileImageUrl?: string;
      rating: number;
    };
    position: number;
    message?: string;
    status: string;
    createdAt: Date;
  }[];
  totalCount: number;
}
```

#### Select Claimer (Owner Only)
- **POST** `/items/:itemId/claims/:claimId/select`
- **Authentication:** Required (JWT, must be item owner)
- **Description:** Select a user to receive the item
- **Response:** `200 OK`
```typescript
{
  message: string;
  selectedClaim: ClaimDetails;
  item: ItemDetails;
}
```
- **Error Responses:**
  - `403 Forbidden` - Not the item owner
  - `404 Not Found` - Claim or item doesn't exist
  - `409 Conflict` - Item already claimed

### Image Upload Controller (`/items/:itemId/images`)

#### Upload Item Images
- **POST** `/items/:itemId/images`
- **Authentication:** Required (JWT, must be item owner)
- **Description:** Upload multiple images for an item
- **Content-Type:** `multipart/form-data`
- **Request:** Files in `images` field (max 10 files)
- **Throttling:** 20 uploads per hour per user
- **Response:** `201 Created`
```typescript
{
  images: {
    id: number;
    url: string;
    thumbnailUrl: string;
    order: number;
    uploadedAt: Date;
  }[];
}
```
- **Error Responses:**
  - `400 Bad Request` - Invalid file format or too many files
  - `413 Payload Too Large` - File size exceeds limit
  - `403 Forbidden` - Not the item owner

#### Delete Item Image
- **DELETE** `/items/:itemId/images/:imageId`
- **Authentication:** Required (JWT, must be item owner)
- **Description:** Delete a specific image from an item
- **Response:** `204 No Content`
- **Error Responses:**
  - `403 Forbidden` - Not the item owner
  - `404 Not Found` - Image doesn't exist

#### Reorder Images
- **PUT** `/items/:itemId/images/reorder`
- **Authentication:** Required (JWT, must be item owner)
- **Description:** Change the order of item images
- **Request Body:**
```typescript
{
  imageOrder: number[]; // Array of image IDs in desired order
}
```
- **Response:** `200 OK` - Updated image list

### Categories Controller (`/categories`)

#### Get All Categories
- **GET** `/categories`
- **Authentication:** None required
- **Description:** Get all available item categories
- **Response:** `200 OK`
```typescript
{
  categories: {
    id: number;
    name: string;
    slug: string;
    description?: string;
    icon?: string;
    itemCount: number;
    parentId?: number;
    children?: Category[];
  }[];
}
```

#### Get Category Details
- **GET** `/categories/:id`
- **Authentication:** None required
- **Description:** Get detailed information about a category
- **Response:** `200 OK` - Category with recent items and statistics

### Location Controller (`/locations`)

#### Discover Nearby Items
- **GET** `/locations/nearby`
- **Authentication:** Optional
- **Description:** Find items near a specific location
- **Query Parameters:**
```typescript
{
  latitude: number;
  longitude: number;
  radius?: number; // Default: 10 miles
  categoryId?: number;
  limit?: number; // Default: 50
}
```
- **Response:** `200 OK`
```typescript
{
  items: (ItemSummary & {
    distance: number;
    distanceUnit: 'miles' | 'km';
  })[];
  center: {
    latitude: number;
    longitude: number;
  };
  radius: number;
}
```

#### Get Popular Locations
- **GET** `/locations/popular`
- **Authentication:** None required
- **Description:** Get locations with the most item activity
- **Response:** `200 OK`
```typescript
{
  locations: {
    name: string;
    itemCount: number;
    activeItems: number;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  }[];
}
```

## Controllers

### ItemsController
- **Path:** `src/items/items.controller.ts`
- **Guards:** `JwtAuthGuard` for protected routes, `OptionalJwtAuthGuard` for optional auth
- **Decorators:** 
  - `@GetUser()` for accessing authenticated user
  - `@Throttle()` for rate limiting
- **Validation:** Use DTOs with class-validator decorators
- **Error Handling:** Custom exceptions for business logic errors

### ClaimsController  
- **Path:** `src/claims/claims.controller.ts`
- **Guards:** `JwtAuthGuard` for all routes
- **Decorators:**
  - `@GetUser()` for user identification
  - `@Param()` for item and claim IDs
  - `@Throttle()` for preventing spam claims
- **Business Rules:** Enforce queue ordering and claim limits

### CategoriesController
- **Path:** `src/categories/categories.controller.ts`  
- **Guards:** None (public endpoints)
- **Caching:** Implement response caching for category lists
- **Validation:** Basic parameter validation

### ImagesController
- **Path:** `src/images/images.controller.ts`
- **Guards:** `JwtAuthGuard` for all routes
- **Interceptors:** `FileInterceptor` and `FilesInterceptor` for uploads
- **Validation:** File type, size, and count validation
- **Storage:** Integration with cloud storage service (AWS S3/CloudFlare R2)

### LocationsController
- **Path:** `src/locations/locations.controller.ts`
- **Guards:** `OptionalJwtAuthGuard` for personalized results
- **Validation:** Coordinate validation and radius limits
- **Performance:** Efficient geospatial queries with database indexing

## Authentication Requirements

### Anonymous Access
- Browse items (`GET /items`)
- View item details (`GET /items/:id`)
- View categories (`GET /categories/*`)
- View popular locations (`GET /locations/popular`)

### Authenticated Access (JWT Required)
- Create items (`POST /items`)
- Update/delete own items (`PUT|DELETE /items/:id`)
- Join claim queues (`POST /items/:itemId/claims`)
- Upload images (`POST /items/:itemId/images`)
- View personal data (`GET /items/my-items`, `GET /items/:itemId/claims/my-position`)

### Owner-Only Access
- View item claim queue (`GET /items/:itemId/claims`)
- Select claimers (`POST /items/:itemId/claims/:claimId/select`)
- Manage item images (`DELETE /items/:itemId/images/:imageId`)

## Error Handling

### Standard HTTP Status Codes
- `200 OK` - Successful GET/PUT requests
- `201 Created` - Successful POST requests  
- `204 No Content` - Successful DELETE requests
- `400 Bad Request` - Invalid input data or business rule violations
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Valid auth but insufficient permissions
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Resource state conflicts (e.g., already claimed)
- `413 Payload Too Large` - File upload size limits exceeded
- `422 Unprocessable Entity` - Valid format but semantic errors
- `429 Too Many Requests` - Rate limit exceeded

### Error Response Format
```typescript
{
  statusCode: number;
  message: string | string[];
  error?: string;
  timestamp: string;
  path: string;
}
```

## Rate Limiting & Throttling

### Item Operations
- Create items: 10 per hour per user
- Update items: 20 per hour per user  
- Delete items: 10 per hour per user

### Claims Operations  
- Join queues: 50 per hour per user
- Cancel claims: 20 per hour per user

### Image Operations
- Upload images: 20 per hour per user
- Delete images: 30 per hour per user

### Search Operations
- Search requests: 100 per 10 minutes per IP
- Location queries: 50 per 10 minutes per IP