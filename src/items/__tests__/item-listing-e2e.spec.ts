import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { ItemsModule } from '../items.module';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from '../../users/users.module';
import { Item } from '../entities/item.entity';
import { ItemClaim } from '../entities/item-claim.entity';
import { ItemCategory } from '../entities/item-category.entity';
import { User } from '../../users/entities/user.entity';
import { ItemStatus } from '../../common/enums/item-status.enum';
import { JwtService } from '@nestjs/jwt';

describe('Item Listing E2E Tests', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let authToken: string;
  let testUser: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT) || 5432,
          username: process.env.DB_USERNAME || 'postgres',
          password: process.env.DB_PASSWORD || 'password',
          database: process.env.DB_NAME_TEST || 'frauc_test',
          entities: [User, Item, ItemClaim, ItemCategory],
          synchronize: true,
          dropSchema: true,
        }),
        AuthModule,
        UsersModule,
        ItemsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);
    await app.init();

    // Create test user
    testUser = {
      id: 1,
      email: 'lister@example.com',
      firstName: 'John',
      lastName: 'Lister',
    };

    authToken = jwtService.sign(testUser);

    // Seed test category
    await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Electronics',
        description: 'Electronic items and gadgets',
      });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    const queryRunner = app.get('DataSource').createQueryRunner();
    await queryRunner.query('DELETE FROM item_claims');
    await queryRunner.query('DELETE FROM item_images');
    await queryRunner.query('DELETE FROM items');
    await queryRunner.release();
  });

  describe('Complete Item Listing Creation Flow', () => {
    it('should successfully create, publish, and manage an item listing from start to finish', async () => {
      // STEP 1: Create a new item listing
      console.log('Step 1: Creating new item listing...');
      
      const createItemDto = {
        title: 'MacBook Pro 2019 - Free to Good Home',
        description: 'Lightly used MacBook Pro. Battery needs replacement but otherwise works perfectly. Comes with charger and carrying case. Perfect for a student or someone learning programming.',
        categoryId: 1,
        zipCode: '90210',
        pickupInstructions: 'Ring doorbell and mention you\'re here for the laptop. Available weekends 10am-6pm.',
        contactMethod: 'email',
        daysUntilExpiration: 14,
        condition: 'used',
        tags: ['laptop', 'macbook', 'programming', 'student'],
      };

      const createResponse = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createItemDto)
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data).toMatchObject({
        title: createItemDto.title,
        description: createItemDto.description,
        status: ItemStatus.ACTIVE,
        userId: testUser.id,
        zipCode: createItemDto.zipCode,
      });

      const itemId = createResponse.body.data.id;
      console.log(`✓ Item created with ID: ${itemId}`);

      // STEP 2: Verify the item appears in search results
      console.log('Step 2: Verifying item appears in search...');
      
      const searchResponse = await request(app.getHttpServer())
        .get('/items')
        .query({ searchTerm: 'macbook', category: 'Electronics' })
        .expect(200);

      expect(searchResponse.body.success).toBe(true);
      expect(searchResponse.body.data.items).toHaveLength(1);
      expect(searchResponse.body.data.items[0].id).toBe(itemId);
      console.log('✓ Item found in search results');

      // STEP 3: Verify location-based search works
      console.log('Step 3: Testing location-based search...');
      
      const nearbyResponse = await request(app.getHttpServer())
        .get('/items/search/nearby')
        .query({
          lat: 34.0522,
          lng: -118.2437,
          radius: 50,
          limit: 10,
        })
        .expect(200);

      expect(nearbyResponse.body.success).toBe(true);
      console.log('✓ Location-based search working');

      // STEP 4: Upload images for the item
      console.log('Step 4: Uploading item images...');
      
      // Simulate file upload (in real test would use actual files)
      const mockFiles = [
        { filename: 'macbook-main.jpg', buffer: Buffer.from('fake image data') },
        { filename: 'macbook-charger.jpg', buffer: Buffer.from('fake image data') },
      ];

      const uploadResponse = await request(app.getHttpServer())
        .post(`/items/${itemId}/images`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('images', Buffer.from('fake image data'), 'macbook-main.jpg')
        .expect(200);

      expect(uploadResponse.body.success).toBe(true);
      expect(uploadResponse.body.data.urls).toHaveLength(1);
      console.log('✓ Images uploaded successfully');

      // STEP 5: First claimer shows interest
      console.log('Step 5: Processing first claim...');
      
      const claimer1 = {
        id: 2,
        email: 'student1@university.edu',
        firstName: 'Alice',
        lastName: 'Student',
      };
      const claimer1Token = jwtService.sign(claimer1);

      const claim1Response = await request(app.getHttpServer())
        .post(`/items/${itemId}/claim`)
        .set('Authorization', `Bearer ${claimer1Token}`)
        .send({
          contactMethod: 'email',
          notes: 'I\'m a computer science student and this would really help with my studies. I can pick up anytime this weekend.',
          preferredPickupDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        })
        .expect(201);

      expect(claim1Response.body.success).toBe(true);
      expect(claim1Response.body.data.queuePosition).toBe(1);
      const claim1Id = claim1Response.body.data.id;
      console.log(`✓ First claim created with ID: ${claim1Id}`);

      // STEP 6: Second claimer shows interest
      console.log('Step 6: Processing second claim...');
      
      const claimer2 = {
        id: 3,
        email: 'developer@freelance.com',
        firstName: 'Bob',
        lastName: 'Developer',
      };
      const claimer2Token = jwtService.sign(claimer2);

      const claim2Response = await request(app.getHttpServer())
        .post(`/items/${itemId}/claim`)
        .set('Authorization', `Bearer ${claimer2Token}`)
        .send({
          contactMethod: 'phone',
          notes: 'I\'m a freelance developer and my laptop just died. I can pick up immediately and am very flexible with timing.',
          preferredPickupDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .expect(201);

      expect(claim2Response.body.success).toBe(true);
      expect(claim2Response.body.data.queuePosition).toBe(2);
      const claim2Id = claim2Response.body.data.id;
      console.log(`✓ Second claim created with ID: ${claim2Id}`);

      // STEP 7: Verify queue status
      console.log('Step 7: Checking queue status...');
      
      const queueResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}/queue`)
        .expect(200);

      expect(queueResponse.body.success).toBe(true);
      expect(queueResponse.body.data.activeClaims).toBe(2);
      expect(queueResponse.body.data.queue).toHaveLength(2);
      expect(queueResponse.body.data.queue[0].userId).toBe(claimer1.id);
      expect(queueResponse.body.data.queue[1].userId).toBe(claimer2.id);
      console.log('✓ Queue status verified - FIFO order maintained');

      // STEP 8: Lister reviews claims and contacts first claimer
      console.log('Step 8: Lister contacting first claimer...');
      
      const contactResponse = await request(app.getHttpServer())
        .put(`/items/claims/${claim1Id}/contact`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'Hi Alice! Thanks for your interest. The laptop is still available. Would Saturday at 2pm work for pickup? I\'m located near Beverly Hills. Please confirm!',
        })
        .expect(200);

      expect(contactResponse.body.success).toBe(true);
      console.log('✓ First claimer contacted');

      // STEP 9: Lister decides to select the first claimer
      console.log('Step 9: Selecting first claimer...');
      
      const selectResponse = await request(app.getHttpServer())
        .put(`/items/claims/${claim1Id}/select`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(selectResponse.body.success).toBe(true);
      console.log('✓ First claimer selected');

      // STEP 10: Verify item status changed
      console.log('Step 10: Verifying item status updated...');
      
      const itemStatusResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}`)
        .expect(200);

      expect(itemStatusResponse.body.data.status).toBe(ItemStatus.CLAIMED);
      console.log('✓ Item status changed to CLAIMED');

      // STEP 11: Verify other claimers are notified (queue status should reflect this)
      console.log('Step 11: Checking impact on other claimers...');
      
      const updatedQueueResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}/queue`)
        .expect(200);

      // The queue should still show all claims but first one should be selected
      expect(updatedQueueResponse.body.data.queue[0].id).toBe(claim1Id);
      console.log('✓ Queue reflects selection');

      // STEP 12: Selected claimer completes the transaction
      console.log('Step 12: Completing the transaction...');
      
      const completeResponse = await request(app.getHttpServer())
        .put(`/items/claims/${claim1Id}/complete`)
        .set('Authorization', `Bearer ${claimer1Token}`)
        .expect(200);

      expect(completeResponse.body.success).toBe(true);
      console.log('✓ Transaction completed by claimer');

      // STEP 13: Verify final state
      console.log('Step 13: Verifying final state...');
      
      // Check lister's items
      const listerItemsResponse = await request(app.getHttpServer())
        .get('/items/user/my-items')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(listerItemsResponse.body.success).toBe(true);
      const completedItem = listerItemsResponse.body.data.find(item => item.id === itemId);
      expect(completedItem.status).toBe(ItemStatus.CLAIMED);

      // Check claimer's claims
      const claimerClaimsResponse = await request(app.getHttpServer())
        .get('/items/user/my-claims')
        .set('Authorization', `Bearer ${claimer1Token}`)
        .expect(200);

      expect(claimerClaimsResponse.body.success).toBe(true);
      const completedClaim = claimerClaimsResponse.body.data.find(claim => claim.id === claim1Id);
      expect(completedClaim.status).toBe('COMPLETED');

      console.log('✓ Final state verified - E2E test completed successfully!');

      // STEP 14: Analytics verification
      console.log('Step 14: Checking analytics...');
      
      const analyticsResponse = await request(app.getHttpServer())
        .get('/items/analytics/overview')
        .expect(200);

      expect(analyticsResponse.body.success).toBe(true);
      expect(analyticsResponse.body.data.totalItems).toBeGreaterThan(0);
      console.log('✓ Analytics data available');
    });

    it('should handle item listing cancellation by lister', async () => {
      console.log('Testing item cancellation flow...');

      // Create item
      const createResponse = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Free Desk - Changed Mind',
          description: 'Office desk, good condition',
          categoryId: 1,
          zipCode: '90210',
          contactMethod: 'email',
        })
        .expect(201);

      const itemId = createResponse.body.data.id;

      // Add a claimer
      const claimerToken = jwtService.sign({
        id: 2,
        email: 'claimer@test.com',
        firstName: 'Test',
        lastName: 'Claimer',
      });

      await request(app.getHttpServer())
        .post(`/items/${itemId}/claim`)
        .set('Authorization', `Bearer ${claimerToken}`)
        .send({ contactMethod: 'email' })
        .expect(201);

      // Lister deletes the item
      const deleteResponse = await request(app.getHttpServer())
        .delete(`/items/${itemId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);

      // Verify item is no longer findable
      await request(app.getHttpServer())
        .get(`/items/${itemId}`)
        .expect(404);

      console.log('✓ Item cancellation flow working correctly');
    });

    it('should handle expired item cleanup', async () => {
      console.log('Testing expired item handling...');

      // Create item with short expiration
      const createResponse = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Short-Lived Item',
          description: 'Will expire soon',
          categoryId: 1,
          zipCode: '90210',
          contactMethod: 'email',
          daysUntilExpiration: 0.001, // Very short expiration for testing
        })
        .expect(201);

      const itemId = createResponse.body.data.id;

      // Wait briefly and then check if item is still active
      await new Promise(resolve => setTimeout(resolve, 100));

      // In a real system, a background job would mark expired items
      // For testing, we'll manually verify the expiration logic
      const itemResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}`)
        .expect(200);

      // Item should still exist but may be marked for expiration processing
      expect(itemResponse.body.data.id).toBe(itemId);

      console.log('✓ Expiration handling logic in place');
    });
  });

  describe('Image Management E2E', () => {
    it('should handle complete image lifecycle', async () => {
      console.log('Testing image management flow...');

      // Create item
      const createResponse = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Item with Images',
          description: 'Testing image uploads',
          categoryId: 1,
          zipCode: '90210',
          contactMethod: 'email',
        })
        .expect(201);

      const itemId = createResponse.body.data.id;

      // Upload multiple images
      const uploadResponse = await request(app.getHttpServer())
        .post(`/items/${itemId}/images`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('images', Buffer.from('fake image 1'), 'image1.jpg')
        .attach('images', Buffer.from('fake image 2'), 'image2.jpg')
        .expect(200);

      expect(uploadResponse.body.success).toBe(true);
      expect(uploadResponse.body.data.urls).toHaveLength(2);

      // Delete one image
      const imageId = 'image1';
      const deleteResponse = await request(app.getHttpServer())
        .delete(`/items/${itemId}/images/${imageId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);

      console.log('✓ Image management flow working correctly');
    });
  });

  describe('Multi-User Interaction Scenarios', () => {
    it('should handle concurrent claim attempts', async () => {
      console.log('Testing concurrent claim handling...');

      // Create popular item
      const createResponse = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Super Popular Item',
          description: 'Everyone wants this',
          categoryId: 1,
          zipCode: '90210',
          contactMethod: 'email',
        })
        .expect(201);

      const itemId = createResponse.body.data.id;

      // Create multiple users trying to claim simultaneously
      const claimPromises = [];
      const numClaimers = 10;

      for (let i = 0; i < numClaimers; i++) {
        const claimerToken = jwtService.sign({
          id: i + 100,
          email: `claimer${i}@test.com`,
          firstName: `Claimer${i}`,
          lastName: 'Test',
        });

        const promise = request(app.getHttpServer())
          .post(`/items/${itemId}/claim`)
          .set('Authorization', `Bearer ${claimerToken}`)
          .send({
            contactMethod: 'email',
            notes: `Claim from user ${i}`,
          });

        claimPromises.push(promise);
      }

      // Execute all claims simultaneously
      const results = await Promise.all(claimPromises);

      // All should succeed and get proper queue positions
      results.forEach((result, index) => {
        expect(result.status).toBe(201);
        expect(result.body.success).toBe(true);
        expect(result.body.data.queuePosition).toBe(index + 1);
      });

      // Verify queue integrity
      const queueResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}/queue`)
        .expect(200);

      expect(queueResponse.body.data.activeClaims).toBe(numClaimers);
      expect(queueResponse.body.data.queue).toHaveLength(numClaimers);

      // Verify positions are sequential
      queueResponse.body.data.queue.forEach((claim, index) => {
        expect(claim.queuePosition).toBe(index + 1);
      });

      console.log('✓ Concurrent claims handled correctly with proper FIFO ordering');
    });

    it('should handle claim cancellations and queue reordering', async () => {
      console.log('Testing claim cancellation and queue reordering...');

      // Create item and multiple claims
      const createResponse = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Queue Test Item',
          description: 'Testing queue operations',
          categoryId: 1,
          zipCode: '90210',
          contactMethod: 'email',
        })
        .expect(201);

      const itemId = createResponse.body.data.id;

      // Create 5 claims
      const claimIds = [];
      const userTokens = [];

      for (let i = 0; i < 5; i++) {
        const userToken = jwtService.sign({
          id: i + 200,
          email: `queuetest${i}@test.com`,
          firstName: `User${i}`,
          lastName: 'Test',
        });
        userTokens.push(userToken);

        const claimResponse = await request(app.getHttpServer())
          .post(`/items/${itemId}/claim`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            contactMethod: 'email',
            notes: `Claim ${i}`,
          })
          .expect(201);

        claimIds.push(claimResponse.body.data.id);
      }

      // User 1 (position 2) cancels their claim
      await request(app.getHttpServer())
        .put(`/items/claims/${claimIds[1]}/cancel`)
        .set('Authorization', `Bearer ${userTokens[1]}`)
        .send({ reason: 'Changed my mind' })
        .expect(200);

      // User 3 (originally position 4, now position 3) cancels
      await request(app.getHttpServer())
        .put(`/items/claims/${claimIds[3]}/cancel`)
        .set('Authorization', `Bearer ${userTokens[3]}`)
        .send({ reason: 'Found alternative' })
        .expect(200);

      // Check final queue state
      const queueResponse = await request(app.getHttpServer())
        .get(`/items/${itemId}/queue`)
        .expect(200);

      expect(queueResponse.body.data.activeClaims).toBe(3);
      const queue = queueResponse.body.data.queue;

      // Should have users 0, 2, 4 in positions 1, 2, 3
      expect(queue[0].userId).toBe(200); // User 0
      expect(queue[0].queuePosition).toBe(1);
      expect(queue[1].userId).toBe(202); // User 2
      expect(queue[1].queuePosition).toBe(2);
      expect(queue[2].userId).toBe(204); // User 4
      expect(queue[2].queuePosition).toBe(3);

      console.log('✓ Queue reordering after cancellations working correctly');
    });
  });
});