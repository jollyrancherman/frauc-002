import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { User } from '../entities/user.entity';
import { AccountStatus } from '../../common/enums/account-status.enum';

describe('UsersService', () => {
  let service: UsersService;
  let repository: Repository<User>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const createUserDto = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const expectedUser = {
        id: 1,
        ...createUserDto,
        accountStatus: AccountStatus.PENDING_VERIFICATION,
        emailVerified: false,
        phoneVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockReturnValue(expectedUser);
      mockRepository.save.mockResolvedValue(expectedUser);

      const result = await service.create(createUserDto);

      expect(mockRepository.create).toHaveBeenCalledWith(createUserDto);
      expect(mockRepository.save).toHaveBeenCalledWith(expectedUser);
      expect(result).toEqual(expectedUser);
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      const email = 'test@example.com';
      const expectedUser = {
        id: 1,
        email,
        firstName: 'John',
        lastName: 'Doe',
        socialAuthProviders: [],
      };

      mockRepository.findOne.mockResolvedValue(expectedUser);

      const result = await service.findByEmail(email);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email },
        relations: ['socialAuthProviders'],
      });
      expect(result).toEqual(expectedUser);
    });

    it('should return null if user not found', async () => {
      const email = 'nonexistent@example.com';
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail(email);

      expect(result).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should find a user by id', async () => {
      const id = 1;
      const expectedUser = {
        id,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        socialAuthProviders: [],
      };

      mockRepository.findOne.mockResolvedValue(expectedUser);

      const result = await service.findOne(id);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id },
        relations: ['socialAuthProviders'],
      });
      expect(result).toEqual(expectedUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      const id = 999;
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('existsByEmail', () => {
    it('should return true if user exists', async () => {
      mockRepository.count.mockResolvedValue(1);

      const result = await service.existsByEmail('test@example.com');

      expect(result).toBe(true);
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { email: 'test@example.com' }
      });
    });

    it('should return false if user does not exist', async () => {
      mockRepository.count.mockResolvedValue(0);

      const result = await service.existsByEmail('test@example.com');

      expect(result).toBe(false);
    });
  });
});