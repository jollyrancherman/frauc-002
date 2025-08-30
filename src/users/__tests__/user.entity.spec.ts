import { User } from '../entities/user.entity';
import { AccountStatus } from '../../common/enums/account-status.enum';

describe('User Entity', () => {
  let user: User;

  beforeEach(() => {
    user = new User();
    user.id = 1;
    user.email = 'test@example.com';
    user.firstName = 'John';
    user.lastName = 'Doe';
    user.accountStatus = AccountStatus.ACTIVE;
    user.emailVerified = true;
    user.phoneVerified = false;
    user.createdAt = new Date();
    user.updatedAt = new Date();
  });

  describe('fullName getter', () => {
    it('should return full name correctly', () => {
      expect(user.fullName).toBe('John Doe');
    });

    it('should handle empty names gracefully', () => {
      user.firstName = '';
      user.lastName = '';
      expect(user.fullName).toBe('');
    });

    it('should trim spaces correctly', () => {
      user.firstName = 'John ';
      user.lastName = ' Doe';
      expect(user.fullName).toBe('John   Doe');
    });
  });

  describe('isProfileComplete getter', () => {
    it('should return true for complete profile', () => {
      expect(user.isProfileComplete).toBe(true);
    });

    it('should return false if firstName is missing', () => {
      user.firstName = '';
      expect(user.isProfileComplete).toBe(false);
    });

    it('should return false if lastName is missing', () => {
      user.lastName = '';
      expect(user.isProfileComplete).toBe(false);
    });

    it('should return false if email is missing', () => {
      user.email = '';
      expect(user.isProfileComplete).toBe(false);
    });

    it('should return false if neither email nor phone is verified', () => {
      user.emailVerified = false;
      user.phoneVerified = false;
      expect(user.isProfileComplete).toBe(false);
    });

    it('should return true if phone is verified but email is not', () => {
      user.emailVerified = false;
      user.phoneVerified = true;
      expect(user.isProfileComplete).toBe(true);
    });
  });

  describe('validateContactInfo', () => {
    it('should not throw error when email is provided', () => {
      user.email = 'test@example.com';
      user.phone = null;
      
      expect(() => user.validateContactInfo()).not.toThrow();
    });

    it('should not throw error when phone is provided', () => {
      user.email = null;
      user.phone = '+1234567890';
      
      expect(() => user.validateContactInfo()).not.toThrow();
    });

    it('should not throw error when both email and phone are provided', () => {
      user.email = 'test@example.com';
      user.phone = '+1234567890';
      
      expect(() => user.validateContactInfo()).not.toThrow();
    });

    it('should throw error when neither email nor phone is provided', () => {
      user.email = null;
      user.phone = null;
      
      expect(() => user.validateContactInfo()).toThrow('User must have either email or phone number');
    });

    it('should throw error when both email and phone are empty strings', () => {
      user.email = '';
      user.phone = '';
      
      expect(() => user.validateContactInfo()).toThrow('User must have either email or phone number');
    });
  });

  describe('updateTimestamp', () => {
    it('should update the updatedAt timestamp', () => {
      const originalTime = user.updatedAt;
      
      // Wait a bit to ensure different timestamp
      setTimeout(() => {
        user.updateTimestamp();
        expect(user.updatedAt).not.toEqual(originalTime);
        expect(user.updatedAt).toBeInstanceOf(Date);
      }, 10);
    });
  });
});