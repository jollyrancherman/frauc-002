import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { SESClient } from '@aws-sdk/client-ses';
import { SNSClient } from '@aws-sdk/client-sns';

@Injectable()
export class AwsConfigService {
  private s3Client: S3Client;
  private sesClient: SESClient;
  private snsClient: SNSClient;

  constructor(private configService: ConfigService) {
    const region = this.configService.get('AWS_REGION', 'us-east-1');
    const credentials = {
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
    };

    this.s3Client = new S3Client({ region, credentials });
    this.sesClient = new SESClient({ region, credentials });
    this.snsClient = new SNSClient({ region, credentials });
  }

  getS3Client(): S3Client {
    return this.s3Client;
  }

  getSESClient(): SESClient {
    return this.sesClient;
  }

  getSNSClient(): SNSClient {
    return this.snsClient;
  }

  getS3BucketName(): string {
    return this.configService.get('AWS_S3_BUCKET', 'frauc-user-images');
  }

  getSESFromEmail(): string {
    return this.configService.get('AWS_SES_FROM_EMAIL', 'noreply@frauc.com');
  }
}