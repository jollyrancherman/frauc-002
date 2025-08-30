import { Injectable } from '@nestjs/common';
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AwsConfigService } from '../config/aws.config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  constructor(private awsConfig: AwsConfigService) {}

  async uploadFile(file: Buffer, filename: string, contentType: string): Promise<string> {
    const key = `profile-images/${uuidv4()}-${filename}`;
    const bucket = this.awsConfig.getS3BucketName();

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
      ACL: 'public-read',
    });

    await this.awsConfig.getS3Client().send(command);

    return `https://${bucket}.s3.amazonaws.com/${key}`;
  }

  async deleteFile(url: string): Promise<void> {
    const bucket = this.awsConfig.getS3BucketName();
    const key = this.extractKeyFromUrl(url);

    if (key) {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.awsConfig.getS3Client().send(command);
    }
  }

  async getPresignedUploadUrl(filename: string, contentType: string): Promise<string> {
    const key = `profile-images/${uuidv4()}-${filename}`;
    const bucket = this.awsConfig.getS3BucketName();

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read',
    });

    return await getSignedUrl(this.awsConfig.getS3Client(), command, { expiresIn: 3600 });
  }

  private extractKeyFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1); // Remove leading slash
    } catch {
      return null;
    }
  }
}