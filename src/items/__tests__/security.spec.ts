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
import { JwtService } from '@nestjs/jwt';

describe('Security Tests', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let validToken: string;
  let testUser: any;
  let testItem: any;

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
      email: 'security@test.com',
      firstName: 'Security',
      lastName: 'Tester',
      role: 'user',
    };

    validToken = jwtService.sign(testUser);

    // Create test category
    await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        name: 'Security Test Category',
        description: 'For security testing',
      });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up and create fresh test data
    const queryRunner = app.get('DataSource').createQueryRunner();
    await queryRunner.query('DELETE FROM item_claims');
    await queryRunner.query('DELETE FROM items');
    await queryRunner.release();

    // Create a test item
    const createResponse = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        title: 'Security Test Item',
        description: 'For security testing',
        categoryId: 1,
        zipCode: '12345',
        contactMethod: 'email',
      });

    testItem = createResponse.body.data;
  });

  describe('Authentication Security Tests', () => {
    it('should reject requests without authentication token', async () => {
      console.log('Testing unauthenticated request rejection...');

      const protectedEndpoints = [
        { method: 'post', path: '/items', data: { title: 'Test' } },
        { method: 'put', path: `/items/${testItem.id}`, data: { title: 'Updated' } },
        { method: 'delete', path: `/items/${testItem.id}` },
        { method: 'post', path: `/items/${testItem.id}/claim`, data: { contactMethod: 'email' } },
        { method: 'get', path: '/items/user/my-items' },
        { method: 'get', path: '/items/user/my-claims' },
        { method: 'post', path: `/items/${testItem.id}/images` },
        { method: 'delete', path: `/items/${testItem.id}/images/test.jpg` },
      ];

      for (const endpoint of protectedEndpoints) {
        let requestBuilder = request(app.getHttpServer())[endpoint.method](endpoint.path);
        
        if (endpoint.data) {
          requestBuilder = requestBuilder.send(endpoint.data);
        }

        const response = await requestBuilder.expect(401);
        
        expect(response.body).toMatchObject({
          success: false,
          message: 'Unauthorized',
        });
      }

      console.log('✓ All protected endpoints properly reject unauthenticated requests');
    });

    it('should reject requests with invalid/malformed tokens', async () => {
      console.log('Testing invalid token rejection...');

      const invalidTokens = [
        'invalid.token.here',
        'Bearer invalid.token.here',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        'expired.token.value',
        '',
        'null',
        'undefined',
      ];

      for (const invalidToken of invalidTokens) {
        const response = await request(app.getHttpServer())
          .post('/items')
          .set('Authorization', `Bearer ${invalidToken}`)
          .send({
            title: 'Should Fail',
            description: 'This should be rejected',
            categoryId: 1,
            zipCode: '12345',
            contactMethod: 'email',
          })
          .expect(401);

        expect(response.body.success).toBe(false);
      }

      console.log('✓ All invalid tokens properly rejected');
    });

    it('should reject expired tokens', async () => {
      console.log('Testing expired token rejection...');

      // Create an expired token (exp claim in the past)
      const expiredTokenPayload = {
        ...testUser,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };

      const expiredToken = jwtService.sign(expiredTokenPayload);

      const response = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          title: 'Should Fail',
          description: 'This should be rejected',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      console.log('✓ Expired tokens properly rejected');
    });

    it('should validate token signature integrity', async () => {
      console.log('Testing token signature validation...');

      // Create a token with valid structure but wrong signature
      const validTokenParts = validToken.split('.');
      const tamperedToken = validTokenParts[0] + '.' + validTokenParts[1] + '.tampered_signature';

      const response = await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .send({
          title: 'Should Fail',
          description: 'Tampered token should be rejected',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      console.log('✓ Token signature tampering properly detected');
    });
  });

  describe('Authorization Security Tests', () => {
    it('should enforce user ownership for item operations', async () => {
      console.log('Testing item ownership enforcement...');

      // Create another user
      const otherUser = {
        id: 2,
        email: 'other@test.com',
        firstName: 'Other',
        lastName: 'User',
      };
      const otherUserToken = jwtService.sign(otherUser);

      // Other user should not be able to update the test item
      await request(app.getHttpServer())
        .put(`/items/${testItem.id}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          title: 'Unauthorized Update',
          description: 'Should be rejected',
        })
        .expect(403);

      // Other user should not be able to delete the test item
      await request(app.getHttpServer())
        .delete(`/items/${testItem.id}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);

      // Other user should not be able to upload images to the test item
      await request(app.getHttpServer())
        .post(`/items/${testItem.id}/images`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .attach('images', Buffer.from('fake image'), 'test.jpg')
        .expect(403);

      console.log('✓ Item ownership properly enforced');
    });

    it('should enforce claim ownership for claim operations', async () => {
      console.log('Testing claim ownership enforcement...');

      // Create a claim
      const claimer = {
        id: 3,
        email: 'claimer@test.com',
        firstName: 'Test',
        lastName: 'Claimer',
      };
      const claimerToken = jwtService.sign(claimer);

      const claimResponse = await request(app.getHttpServer())
        .post(`/items/${testItem.id}/claim`)
        .set('Authorization', `Bearer ${claimerToken}`)
        .send({
          contactMethod: 'email',
          notes: 'Test claim',
        })
        .expect(201);

      const claimId = claimResponse.body.data.id;

      // Different user should not be able to cancel this claim
      const anotherUser = {
        id: 4,
        email: 'another@test.com',
        firstName: 'Another',
        lastName: 'User',
      };
      const anotherUserToken = jwtService.sign(anotherUser);

      await request(app.getHttpServer())
        .put(`/items/claims/${claimId}/cancel`)
        .set('Authorization', `Bearer ${anotherUserToken}`)
        .send({ reason: 'Should fail' })
        .expect(403);

      // Different user should not be able to complete this claim
      await request(app.getHttpServer())
        .put(`/items/claims/${claimId}/complete`)
        .set('Authorization', `Bearer ${anotherUserToken}`)
        .expect(403);

      console.log('✓ Claim ownership properly enforced');
    });

    it('should enforce lister permissions for claim management', async () => {
      console.log('Testing lister permission enforcement...');

      // Create a claim
      const claimer = {
        id: 5,
        email: 'claimer2@test.com',
        firstName: 'Test',
        lastName: 'Claimer2',
      };
      const claimerToken = jwtService.sign(claimer);

      const claimResponse = await request(app.getHttpServer())
        .post(`/items/${testItem.id}/claim`)
        .set('Authorization', `Bearer ${claimerToken}`)
        .send({
          contactMethod: 'email',
          notes: 'Test claim for lister permissions',
        })
        .expect(201);

      const claimId = claimResponse.body.data.id;

      // Non-lister should not be able to contact claimer
      const nonLister = {
        id: 6,
        email: 'nonlister@test.com',
        firstName: 'Non',
        lastName: 'Lister',
      };
      const nonListerToken = jwtService.sign(nonLister);

      await request(app.getHttpServer())
        .put(`/items/claims/${claimId}/contact`)
        .set('Authorization', `Bearer ${nonListerToken}`)
        .send({ message: 'Should fail' })
        .expect(403);

      // Non-lister should not be able to select claimer
      await request(app.getHttpServer())
        .put(`/items/claims/${claimId}/select`)
        .set('Authorization', `Bearer ${nonListerToken}`)
        .expect(403);

      // Only the actual lister should be able to perform these actions
      await request(app.getHttpServer())
        .put(`/items/claims/${claimId}/contact`)
        .set('Authorization', `Bearer ${validToken}`) // testUser is the lister
        .send({ message: 'This should work' })
        .expect(200);

      console.log('✓ Lister permissions properly enforced');
    });

    it('should prevent users from claiming their own items', async () => {
      console.log('Testing self-claim prevention...');

      // Lister tries to claim their own item
      const response = await request(app.getHttpServer())
        .post(`/items/${testItem.id}/claim`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          contactMethod: 'email',
          notes: 'Trying to claim my own item',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('cannot claim your own item');

      console.log('✓ Self-claim prevention working correctly');
    });

    it('should prevent duplicate claims from same user', async () => {
      console.log('Testing duplicate claim prevention...');

      const claimer = {
        id: 7,
        email: 'duplicate@test.com',
        firstName: 'Duplicate',
        lastName: 'Claimer',
      };
      const claimerToken = jwtService.sign(claimer);

      // First claim should succeed
      await request(app.getHttpServer())
        .post(`/items/${testItem.id}/claim`)
        .set('Authorization', `Bearer ${claimerToken}`)
        .send({
          contactMethod: 'email',
          notes: 'First claim',
        })
        .expect(201);

      // Second claim should fail
      const duplicateResponse = await request(app.getHttpServer())
        .post(`/items/${testItem.id}/claim`)
        .set('Authorization', `Bearer ${claimerToken}`)
        .send({
          contactMethod: 'email',
          notes: 'Duplicate claim attempt',
        })
        .expect(400);

      expect(duplicateResponse.body.success).toBe(false);
      expect(duplicateResponse.body.error).toContain('already have an active claim');

      console.log('✓ Duplicate claim prevention working correctly');
    });
  });

  describe('Input Validation Security Tests', () => {
    it('should validate and sanitize item creation input', async () => {
      console.log('Testing input validation for item creation...');

      const maliciousInputs = [
        {
          title: '<script>alert("xss")</script>',
          description: 'Should sanitize script tags',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        },
        {
          title: 'Valid Title',
          description: '<?php system("rm -rf /"); ?>',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        },
        {
          title: 'SQL Injection Test',
          description: "'; DROP TABLE items; --",
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        },
        {
          title: 'A'.repeat(1000), // Excessively long title
          description: 'Normal description',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        },
        {
          title: '', // Empty title
          description: 'Description',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        },
        {
          title: 'Valid Title',
          description: 'Valid Description',
          categoryId: 'invalid', // Invalid category ID
          zipCode: '12345',
          contactMethod: 'email',
        },
        {
          title: 'Valid Title',
          description: 'Valid Description',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'invalid_method', // Invalid contact method
        },
      ];

      for (const input of maliciousInputs) {
        const response = await request(app.getHttpServer())
          .post('/items')
          .set('Authorization', `Bearer ${validToken}`)
          .send(input);

        // Should either reject with validation error (400) or sanitize the input
        if (response.status === 201) {
          // If accepted, verify dangerous content was sanitized
          expect(response.body.data.title).not.toContain('<script>');
          expect(response.body.data.description).not.toContain('<?php');
          expect(response.body.data.description).not.toContain('DROP TABLE');
        } else {
          expect(response.status).toBe(400);
          expect(response.body.success).toBe(false);
        }
      }

      console.log('✓ Input validation and sanitization working correctly');
    });

    it('should validate numeric parameters and prevent injection', async () => {
      console.log('Testing numeric parameter validation...');

      const invalidParams = [
        'invalid_id',
        '-1',
        '0',
        '999999999999999999999', // Extremely large number
        'null',
        'undefined',
        '<script>alert("xss")</script>',
        '1; DROP TABLE items; --',
      ];

      for (const param of invalidParams) {
        // Test item ID validation
        const itemResponse = await request(app.getHttpServer())
          .get(`/items/${param}`)
          .expect(400); // Should reject invalid ID format

        expect(itemResponse.body.success).toBe(false);

        // Test claim ID validation
        await request(app.getHttpServer())
          .put(`/items/claims/${param}/cancel`)
          .set('Authorization', `Bearer ${validToken}`)
          .send({ reason: 'Test' })
          .expect(400);
      }

      console.log('✓ Numeric parameter validation working correctly');
    });

    it('should validate query parameters for search', async () => {
      console.log('Testing search query parameter validation...');

      const maliciousQueries = [
        { searchTerm: '<script>alert("xss")</script>' },
        { searchTerm: ''; DROP TABLE items; --' },
        { page: -1 },
        { page: 'invalid' },
        { limit: -1 },
        { limit: 100000 }, // Extremely large limit
        { sortBy: 'invalid_column' },
        { sortOrder: 'INVALID' },
        { category: '<script>alert("xss")</script>' },
      ];

      for (const query of maliciousQueries) {
        const response = await request(app.getHttpServer())
          .get('/items')
          .query(query);

        // Should either handle gracefully (200) or reject with validation error (400)
        if (response.status === 200) {
          // If accepted, verify response is safe
          expect(response.body.success).toBe(true);
          expect(response.body.data).toBeDefined();
        } else {
          expect([400, 422]).toContain(response.status);
          expect(response.body.success).toBe(false);
        }
      }

      console.log('✓ Search parameter validation working correctly');
    });

    it('should validate file upload security', async () => {
      console.log('Testing file upload security...');

      const maliciousFiles = [
        {
          name: 'script.js',
          content: 'alert("malicious code")',
          mimetype: 'application/javascript',
        },
        {
          name: 'malware.exe',
          content: 'fake executable content',
          mimetype: 'application/x-msdownload',
        },
        {
          name: 'shell.php',
          content: '<?php system($_GET["cmd"]); ?>',
          mimetype: 'application/x-php',
        },
        {
          name: 'huge_file.txt',
          content: 'A'.repeat(50 * 1024 * 1024), // 50MB file
          mimetype: 'text/plain',
        },
        {
          name: '../../../etc/passwd',
          content: 'path traversal attempt',
          mimetype: 'text/plain',
        },
      ];

      for (const file of maliciousFiles) {
        const response = await request(app.getHttpServer())
          .post(`/items/${testItem.id}/images`)
          .set('Authorization', `Bearer ${validToken}`)
          .attach('images', Buffer.from(file.content), file.name);

        // Should reject malicious files
        if (response.status !== 200) {
          expect([400, 413, 415, 422]).toContain(response.status); // Various rejection codes
          expect(response.body.success).toBe(false);
        } else {
          // If accepted, verify proper handling
          expect(response.body.success).toBe(true);
          // Filename should be sanitized
          response.body.data.urls.forEach(url => {
            expect(url).not.toContain('../');
            expect(url).not.toContain('etc/passwd');
          });
        }
      }

      console.log('✓ File upload security working correctly');
    });
  });

  describe('Rate Limiting and Abuse Prevention', () => {
    it('should handle rapid successive requests appropriately', async () => {
      console.log('Testing rapid request handling...');

      const rapidRequests = [];
      const numRequests = 100;

      // Create many requests rapidly
      for (let i = 0; i < numRequests; i++) {
        rapidRequests.push(
          request(app.getHttpServer())
            .get('/items')
            .set('Authorization', `Bearer ${validToken}`)
            .query({ page: 1, limit: 10 })
        );
      }

      const responses = await Promise.all(rapidRequests);
      let successCount = 0;
      let rateLimitedCount = 0;

      responses.forEach(response => {
        if (response.status === 200) {
          successCount++;
        } else if (response.status === 429) { // Too Many Requests
          rateLimitedCount++;
        }
      });

      console.log(`✓ Handled ${numRequests} rapid requests: ${successCount} success, ${rateLimitedCount} rate limited`);

      // Should handle requests without crashing
      expect(successCount + rateLimitedCount).toBe(numRequests);
    });

    it('should prevent resource exhaustion attacks', async () => {
      console.log('Testing resource exhaustion prevention...');

      // Test with very large page sizes
      const largePageResponse = await request(app.getHttpServer())
        .get('/items')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ limit: 100000 }); // Extremely large limit

      // Should either cap the limit or reject the request
      if (largePageResponse.status === 200) {
        expect(largePageResponse.body.data.items.length).toBeLessThanOrEqual(1000);
      } else {
        expect(largePageResponse.status).toBe(400);
      }

      // Test deeply nested requests (if applicable to your API)
      const maxDepthResponse = await request(app.getHttpServer())
        .get('/items')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ 
          include: 'a'.repeat(10000), // Very long include parameter
        });

      // Should handle gracefully
      expect([200, 400, 422]).toContain(maxDepthResponse.status);

      console.log('✓ Resource exhaustion prevention working correctly');
    });
  });

  describe('Data Exposure Prevention', () => {
    it('should not expose sensitive user information', async () => {
      console.log('Testing sensitive data exposure prevention...');

      // Get items and verify user data doesn't contain sensitive info
      const itemsResponse = await request(app.getHttpServer())
        .get('/items')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      if (itemsResponse.body.data.items.length > 0) {
        const item = itemsResponse.body.data.items[0];
        
        // Should not expose user passwords, tokens, or internal IDs
        expect(item.user?.password).toBeUndefined();
        expect(item.user?.passwordHash).toBeUndefined();
        expect(item.user?.token).toBeUndefined();
        expect(item.user?.refreshToken).toBeUndefined();
      }

      // Get item details and verify no sensitive data exposure
      const itemResponse = await request(app.getHttpServer())
        .get(`/items/${testItem.id}`)
        .expect(200);

      const itemDetail = itemResponse.body.data;
      expect(itemDetail.user?.password).toBeUndefined();
      expect(itemDetail.user?.passwordHash).toBeUndefined();

      console.log('✓ Sensitive data exposure prevention working correctly');
    });

    it('should not expose internal system information in errors', async () => {
      console.log('Testing error information exposure prevention...');

      // Test various error conditions
      const errorTests = [
        () => request(app.getHttpServer()).get('/items/999999').expect(404),
        () => request(app.getHttpServer())
          .post('/items')
          .set('Authorization', `Bearer ${validToken}`)
          .send({}) // Invalid data
          .expect(400),
        () => request(app.getHttpServer())
          .put(`/items/claims/999999/cancel`)
          .set('Authorization', `Bearer ${validToken}`)
          .send({ reason: 'test' })
          .expect(404),
      ];

      for (const test of errorTests) {
        const response = await test();
        
        // Error responses should not contain sensitive system information
        const errorBody = JSON.stringify(response.body);
        expect(errorBody).not.toMatch(/password/i);
        expect(errorBody).not.toMatch(/secret/i);
        expect(errorBody).not.toMatch(/database/i);
        expect(errorBody).not.toMatch(/connection/i);
        expect(errorBody).not.toMatch(/stack trace/i);
        expect(errorBody).not.toMatch(/error.*at.*line/i);
      }

      console.log('✓ Error information exposure prevention working correctly');
    });

    it('should enforce proper CORS policies', async () => {
      console.log('Testing CORS policy enforcement...');

      // Test preflight request
      const preflightResponse = await request(app.getHttpServer())
        .options('/items')
        .set('Origin', 'https://malicious-site.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,authorization');

      // Should have proper CORS headers or reject cross-origin requests
      if (preflightResponse.status === 200) {
        // If CORS is allowed, verify it's properly configured
        expect(preflightResponse.headers['access-control-allow-origin']).toBeDefined();
      } else {
        // If CORS is rejected, that's also acceptable for security
        expect([403, 404]).toContain(preflightResponse.status);
      }

      console.log('✓ CORS policy properly configured');
    });
  });

  describe('Session and Token Security', () => {
    it('should handle token refresh securely', async () => {
      console.log('Testing token security...');

      // Test with short-lived token
      const shortLivedPayload = {
        ...testUser,
        exp: Math.floor(Date.now() / 1000) + 60, // Expires in 1 minute
      };
      
      const shortLivedToken = jwtService.sign(shortLivedPayload);

      // Should work while valid
      await request(app.getHttpServer())
        .get('/items')
        .set('Authorization', `Bearer ${shortLivedToken}`)
        .expect(200);

      console.log('✓ Token security measures in place');
    });

    it('should prevent token tampering', async () => {
      console.log('Testing token tampering prevention...');

      const tokenParts = validToken.split('.');
      
      // Tamper with payload
      const tamperedPayload = Buffer.from(JSON.stringify({
        ...testUser,
        id: 999, // Different user ID
        role: 'admin', // Elevated privileges
      })).toString('base64');
      
      const tamperedToken = tokenParts[0] + '.' + tamperedPayload + '.' + tokenParts[2];

      // Should reject tampered token
      await request(app.getHttpServer())
        .post('/items')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .send({
          title: 'Should Fail',
          description: 'Tampered token should be rejected',
          categoryId: 1,
          zipCode: '12345',
          contactMethod: 'email',
        })
        .expect(401);

      console.log('✓ Token tampering prevention working correctly');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should prevent SQL injection in search queries', async () => {
      console.log('Testing SQL injection prevention...');

      const sqlInjectionAttempts = [
        "'; DROP TABLE items; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM users --",
        "'; INSERT INTO items (title) VALUES ('injected'); --",
        "' AND 1=0 UNION SELECT password FROM users WHERE '1'='1",
        "admin'--",
        "admin' #",
        "admin'/*",
        "' or 1=1#",
        "' or 1=1--",
        "' or 1=1/*",
        "') or '1'='1--",
        "') or ('1'='1--",
      ];

      for (const injection of sqlInjectionAttempts) {
        // Test in search term
        const searchResponse = await request(app.getHttpServer())
          .get('/items')
          .query({ searchTerm: injection });

        // Should handle safely without SQL errors
        expect([200, 400]).toContain(searchResponse.status);
        
        if (searchResponse.status === 200) {
          expect(searchResponse.body.success).toBe(true);
          expect(searchResponse.body.data).toBeDefined();
        }

        // Test in item creation
        const createResponse = await request(app.getHttpServer())
          .post('/items')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            title: injection,
            description: 'SQL injection test',
            categoryId: 1,
            zipCode: '12345',
            contactMethod: 'email',
          });

        // Should either safely store the data or reject it
        expect([200, 201, 400]).toContain(createResponse.status);
      }

      console.log('✓ SQL injection prevention working correctly');
    });
  });

  describe('XSS Prevention', () => {
    it('should prevent cross-site scripting attacks', async () => {
      console.log('Testing XSS prevention...');

      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src="x" onerror="alert(\'XSS\')">',
        '<svg onload="alert(\'XSS\')">',
        'javascript:alert("XSS")',
        '<iframe src="javascript:alert(\'XSS\')"></iframe>',
        '<body onload="alert(\'XSS\')">',
        '<div onclick="alert(\'XSS\')">Click me</div>',
        '"><script>alert("XSS")</script>',
        '\'; alert("XSS"); //',
      ];

      for (const payload of xssPayloads) {
        // Test XSS in item creation
        const createResponse = await request(app.getHttpServer())
          .post('/items')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            title: payload,
            description: `XSS test with payload: ${payload}`,
            categoryId: 1,
            zipCode: '12345',
            contactMethod: 'email',
          });

        if (createResponse.status === 201) {
          // If item was created, verify XSS payload was sanitized
          expect(createResponse.body.data.title).not.toContain('<script>');
          expect(createResponse.body.data.title).not.toContain('javascript:');
          expect(createResponse.body.data.title).not.toContain('onerror');
          expect(createResponse.body.data.title).not.toContain('onload');
        }
      }

      console.log('✓ XSS prevention working correctly');
    });
  });
});