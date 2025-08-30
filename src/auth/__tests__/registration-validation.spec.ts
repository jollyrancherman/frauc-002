import { validate } from 'class-validator';
import { RegisterDto } from '../dto/register.dto';
import { CompleteProfileDto } from '../dto/complete-profile.dto';

describe('Registration Validation', () => {
  describe('RegisterDto', () => {
    let registerDto: RegisterDto;

    beforeEach(() => {
      registerDto = new RegisterDto();
    });

    describe('email validation', () => {
      it('should pass with valid email', async () => {
        registerDto.email = 'test@example.com';
        registerDto.password = 'Test123!@#';
        registerDto.firstName = 'John';
        registerDto.lastName = 'Doe';

        const errors = await validate(registerDto);
        const emailErrors = errors.find(error => error.property === 'email');
        expect(emailErrors).toBeUndefined();
      });

      it('should fail with invalid email format', async () => {
        registerDto.email = 'invalid-email';
        registerDto.password = 'Test123!@#';
        registerDto.firstName = 'John';
        registerDto.lastName = 'Doe';

        const errors = await validate(registerDto);
        const emailErrors = errors.find(error => error.property === 'email');
        expect(emailErrors).toBeDefined();
        expect(emailErrors?.constraints?.isEmail).toContain('valid email address');
      });

      it('should fail with empty email', async () => {
        registerDto.password = 'Test123!@#';
        registerDto.firstName = 'John';
        registerDto.lastName = 'Doe';

        const errors = await validate(registerDto);
        const emailErrors = errors.find(error => error.property === 'email');
        expect(emailErrors).toBeDefined();
      });
    });

    describe('password validation', () => {
      it('should pass with strong password', async () => {
        registerDto.email = 'test@example.com';
        registerDto.password = 'Test123!@#';
        registerDto.firstName = 'John';
        registerDto.lastName = 'Doe';

        const errors = await validate(registerDto);
        const passwordErrors = errors.find(error => error.property === 'password');
        expect(passwordErrors).toBeUndefined();
      });

      it('should fail with short password', async () => {
        registerDto.email = 'test@example.com';
        registerDto.password = 'Test1!';
        registerDto.firstName = 'John';
        registerDto.lastName = 'Doe';

        const errors = await validate(registerDto);
        const passwordErrors = errors.find(error => error.property === 'password');
        expect(passwordErrors).toBeDefined();
        expect(passwordErrors?.constraints?.minLength).toContain('at least 8 characters');
      });

      it('should fail without uppercase letter', async () => {
        registerDto.email = 'test@example.com';
        registerDto.password = 'test123!@#';
        registerDto.firstName = 'John';
        registerDto.lastName = 'Doe';

        const errors = await validate(registerDto);
        const passwordErrors = errors.find(error => error.property === 'password');
        expect(passwordErrors).toBeDefined();
        expect(passwordErrors?.constraints?.matches).toContain('uppercase letter');
      });

      it('should fail without lowercase letter', async () => {
        registerDto.email = 'test@example.com';
        registerDto.password = 'TEST123!@#';
        registerDto.firstName = 'John';
        registerDto.lastName = 'Doe';

        const errors = await validate(registerDto);
        const passwordErrors = errors.find(error => error.property === 'password');
        expect(passwordErrors).toBeDefined();
        expect(passwordErrors?.constraints?.matches).toContain('lowercase letter');
      });

      it('should fail without number', async () => {
        registerDto.email = 'test@example.com';
        registerDto.password = 'TestTest!@#';
        registerDto.firstName = 'John';
        registerDto.lastName = 'Doe';

        const errors = await validate(registerDto);
        const passwordErrors = errors.find(error => error.property === 'password');
        expect(passwordErrors).toBeDefined();
        expect(passwordErrors?.constraints?.matches).toContain('number');
      });

      it('should fail without special character', async () => {
        registerDto.email = 'test@example.com';
        registerDto.password = 'Test123ABC';
        registerDto.firstName = 'John';
        registerDto.lastName = 'Doe';

        const errors = await validate(registerDto);
        const passwordErrors = errors.find(error => error.property === 'password');
        expect(passwordErrors).toBeDefined();
        expect(passwordErrors?.constraints?.matches).toContain('special character');
      });
    });

    describe('name validation', () => {
      it('should pass with valid names', async () => {
        registerDto.email = 'test@example.com';
        registerDto.password = 'Test123!@#';
        registerDto.firstName = 'John';
        registerDto.lastName = 'Doe';

        const errors = await validate(registerDto);
        const firstNameErrors = errors.find(error => error.property === 'firstName');
        const lastNameErrors = errors.find(error => error.property === 'lastName');
        expect(firstNameErrors).toBeUndefined();
        expect(lastNameErrors).toBeUndefined();
      });

      it('should fail with short first name', async () => {
        registerDto.email = 'test@example.com';
        registerDto.password = 'Test123!@#';
        registerDto.firstName = 'J';
        registerDto.lastName = 'Doe';

        const errors = await validate(registerDto);
        const firstNameErrors = errors.find(error => error.property === 'firstName');
        expect(firstNameErrors).toBeDefined();
        expect(firstNameErrors?.constraints?.minLength).toContain('at least 2 characters');
      });

      it('should fail with long first name', async () => {
        registerDto.email = 'test@example.com';
        registerDto.password = 'Test123!@#';
        registerDto.firstName = 'J'.repeat(101);
        registerDto.lastName = 'Doe';

        const errors = await validate(registerDto);
        const firstNameErrors = errors.find(error => error.property === 'firstName');
        expect(firstNameErrors).toBeDefined();
        expect(firstNameErrors?.constraints?.maxLength).toContain('exceed 100 characters');
      });
    });
  });

  describe('CompleteProfileDto', () => {
    it('should pass with optional fields empty', async () => {
      const completeProfileDto = new CompleteProfileDto();
      const errors = await validate(completeProfileDto);
      expect(errors).toHaveLength(0);
    });

    it('should pass with valid location text', async () => {
      const completeProfileDto = new CompleteProfileDto();
      completeProfileDto.locationText = 'New York, NY';

      const errors = await validate(completeProfileDto);
      expect(errors).toHaveLength(0);
    });

    it('should fail with too long location text', async () => {
      const completeProfileDto = new CompleteProfileDto();
      completeProfileDto.locationText = 'x'.repeat(256); // Too long

      const errors = await validate(completeProfileDto);
      const locationErrors = errors.find(error => error.property === 'locationText');
      expect(locationErrors).toBeDefined();
      expect(locationErrors?.constraints?.maxLength).toContain('exceed 255 characters');
    });

    it('should fail with invalid profile image URL length', async () => {
      const completeProfileDto = new CompleteProfileDto();
      completeProfileDto.profileImageUrl = 'x'.repeat(256); // Too long

      const errors = await validate(completeProfileDto);
      const imageUrlErrors = errors.find(error => error.property === 'profileImageUrl');
      expect(imageUrlErrors).toBeDefined();
    });
  });
});