import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { ConfigService } from '@nestjs/config';

export enum AuditAction {
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_REGISTRATION = 'user_registration',
  PROFILE_UPDATE = 'profile_update',
  PASSWORD_CHANGE = 'password_change',
  PASSWORD_RESET_REQUEST = 'password_reset_request',
  PASSWORD_RESET_SUCCESS = 'password_reset_success',
  EMAIL_VERIFICATION = 'email_verification',
  PHONE_VERIFICATION = 'phone_verification',
  IMAGE_UPLOAD = 'image_upload',
  IMAGE_DELETE = 'image_delete',
  ACCOUNT_DEACTIVATION = 'account_deactivation',
  ACCOUNT_REACTIVATION = 'account_reactivation',
  DATA_EXPORT = 'data_export',
  FAILED_LOGIN_ATTEMPT = 'failed_login_attempt',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
}

export interface AuditContext {
  userId?: number;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  deviceInfo?: string;
  location?: string;
  additionalData?: Record<string, any>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly RETENTION_DAYS = 90;

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    private configService: ConfigService,
  ) {}

  async logAction(
    action: AuditAction,
    context: AuditContext,
    details?: string,
  ): Promise<void> {
    try {
      const auditLog = this.auditLogRepository.create({
        action,
        userId: context.userId,
        ipAddress: context.ipAddress || 'unknown',
        userAgent: context.userAgent,
        sessionId: context.sessionId,
        deviceInfo: context.deviceInfo,
        location: context.location,
        details,
        additionalData: context.additionalData,
        timestamp: new Date(),
      });

      await this.auditLogRepository.save(auditLog);
      
      this.logger.log(`Audit log created: ${action} for user ${context.userId || 'unknown'}`);
    } catch (error) {
      this.logger.error(`Failed to create audit log for action: ${action}`, error);
    }
  }

  async logUserLogin(userId: number, ipAddress: string, userAgent?: string, sessionId?: string): Promise<void> {
    await this.logAction(
      AuditAction.USER_LOGIN,
      { userId, ipAddress, userAgent, sessionId },
      'User successfully logged in',
    );
  }

  async logUserLogout(userId: number, sessionId?: string, ipAddress?: string): Promise<void> {
    await this.logAction(
      AuditAction.USER_LOGOUT,
      { userId, ipAddress, sessionId },
      'User logged out',
    );
  }

  async logUserRegistration(userId: number, email: string, ipAddress: string, method: string): Promise<void> {
    await this.logAction(
      AuditAction.USER_REGISTRATION,
      { userId, ipAddress },
      `User registered with email: ${email} via ${method}`,
    );
  }

  async logProfileUpdate(userId: number, updatedFields: any, ipAddress: string): Promise<void> {
    const fieldNames = Object.keys(updatedFields).join(', ');
    await this.logAction(
      AuditAction.PROFILE_UPDATE,
      { userId, ipAddress, additionalData: { updatedFields: fieldNames } },
      `Profile updated - fields: ${fieldNames}`,
    );
  }

  async logPasswordChange(userId: number, ipAddress: string): Promise<void> {
    await this.logAction(
      AuditAction.PASSWORD_CHANGE,
      { userId, ipAddress },
      'User password changed successfully',
    );
  }

  async logPasswordResetRequest(userId: number, method: 'email' | 'sms', ipAddress: string): Promise<void> {
    await this.logAction(
      AuditAction.PASSWORD_RESET_REQUEST,
      { userId, ipAddress },
      `Password reset requested via ${method}`,
    );
  }

  async logPasswordResetSuccess(userId: number, method: 'email' | 'sms'): Promise<void> {
    await this.logAction(
      AuditAction.PASSWORD_RESET_SUCCESS,
      { userId },
      `Password reset completed via ${method}`,
    );
  }

  async logEmailVerification(userId: number, email: string, ipAddress?: string): Promise<void> {
    await this.logAction(
      AuditAction.EMAIL_VERIFICATION,
      { userId, ipAddress },
      `Email verified: ${email}`,
    );
  }

  async logPhoneVerification(userId: number, phone: string, ipAddress?: string): Promise<void> {
    await this.logAction(
      AuditAction.PHONE_VERIFICATION,
      { userId, ipAddress },
      `Phone verified: ${phone}`,
    );
  }

  async logImageUpload(userId: number, imageUrl: string): Promise<void> {
    await this.logAction(
      AuditAction.IMAGE_UPLOAD,
      { userId },
      `Profile image uploaded: ${imageUrl}`,
    );
  }

  async logImageDelete(userId: number, imageUrl: string): Promise<void> {
    await this.logAction(
      AuditAction.IMAGE_DELETE,
      { userId },
      `Profile image deleted: ${imageUrl}`,
    );
  }

  async logAccountDeactivation(userId: number, reason: string): Promise<void> {
    await this.logAction(
      AuditAction.ACCOUNT_DEACTIVATION,
      { userId },
      `Account deactivated - reason: ${reason}`,
    );
  }

  async logAccountReactivation(userId: number): Promise<void> {
    await this.logAction(
      AuditAction.ACCOUNT_REACTIVATION,
      { userId },
      'Account reactivated',
    );
  }

  async logDataExport(userId: number, format: string): Promise<void> {
    await this.logAction(
      AuditAction.DATA_EXPORT,
      { userId },
      `User data exported in ${format} format`,
    );
  }

  async logFailedLoginAttempt(email: string, ipAddress: string, reason: string): Promise<void> {
    await this.logAction(
      AuditAction.FAILED_LOGIN_ATTEMPT,
      { ipAddress, additionalData: { email, reason } },
      `Failed login attempt for email: ${email} - ${reason}`,
    );
  }

  async logSuspiciousActivity(
    action: string,
    context: AuditContext,
    riskLevel: 'low' | 'medium' | 'high',
  ): Promise<void> {
    await this.logAction(
      AuditAction.SUSPICIOUS_ACTIVITY,
      context,
      `Suspicious activity detected: ${action} (Risk: ${riskLevel})`,
    );
  }

  async getUserAuditLogs(
    userId: number,
    limit: number = 50,
    offset: number = 0,
  ): Promise<AuditLog[]> {
    return await this.auditLogRepository.find({
      where: { userId },
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async getAuditLogsByAction(
    action: AuditAction,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100,
  ): Promise<AuditLog[]> {
    const query = this.auditLogRepository.createQueryBuilder('audit_log')
      .where('audit_log.action = :action', { action });

    if (startDate) {
      query.andWhere('audit_log.timestamp >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('audit_log.timestamp <= :endDate', { endDate });
    }

    return await query
      .orderBy('audit_log.timestamp', 'DESC')
      .limit(limit)
      .getMany();
  }

  async cleanupOldLogs(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_DAYS);

    const result = await this.auditLogRepository
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(`Cleaned up ${result.affected} old audit logs older than ${this.RETENTION_DAYS} days`);
  }

  async getSecurityReport(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalEvents: number;
    failedLogins: number;
    suspiciousActivities: number;
    passwordResets: number;
    accountDeactivations: number;
    topIpAddresses: Array<{ ip: string; count: number }>;
  }> {
    const [
      totalEvents,
      failedLogins,
      suspiciousActivities,
      passwordResets,
      accountDeactivations,
    ] = await Promise.all([
      this.auditLogRepository.count({
        where: {
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          } as any,
        },
      }),
      this.auditLogRepository.count({
        where: {
          action: AuditAction.FAILED_LOGIN_ATTEMPT,
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          } as any,
        },
      }),
      this.auditLogRepository.count({
        where: {
          action: AuditAction.SUSPICIOUS_ACTIVITY,
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          } as any,
        },
      }),
      this.auditLogRepository.count({
        where: {
          action: AuditAction.PASSWORD_RESET_REQUEST,
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          } as any,
        },
      }),
      this.auditLogRepository.count({
        where: {
          action: AuditAction.ACCOUNT_DEACTIVATION,
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          } as any,
        },
      }),
    ]);

    // Get top IP addresses by activity
    const topIpAddresses = await this.auditLogRepository
      .createQueryBuilder('audit_log')
      .select('audit_log.ipAddress', 'ip')
      .addSelect('COUNT(*)', 'count')
      .where('audit_log.timestamp >= :startDate', { startDate })
      .andWhere('audit_log.timestamp <= :endDate', { endDate })
      .groupBy('audit_log.ipAddress')
      .orderBy('COUNT(*)', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      totalEvents,
      failedLogins,
      suspiciousActivities,
      passwordResets,
      accountDeactivations,
      topIpAddresses: topIpAddresses.map(row => ({
        ip: row.ip,
        count: parseInt(row.count),
      })),
    };
  }
}