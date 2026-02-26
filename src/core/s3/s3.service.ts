import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { makeError } from '../../common/utils';
import { FnResult } from '../../types/common.types';
import { AppConfigService } from '../app-config/app-config.service';

@Injectable()
export class S3Service implements OnModuleDestroy {
  private readonly s3Client: S3Client;

  constructor(private readonly configService: AppConfigService) {
    if (
      !configService.AwsRegion.success ||
      !configService.AwsAccessKey.success ||
      !configService.AwsSecretKey.success
    ) {
      throw new Error('AWS region, access key, or secret key not found');
    }

    this.s3Client = new S3Client({
      region: configService.AwsRegion.data,
      credentials: {
        accessKeyId: configService.AwsAccessKey.data,
        secretAccessKey: configService.AwsSecretKey.data,
      },
    });
  }

  async uploadToS3({
    body,
    tags,
    bucket,
    key,
    cacheControl,
  }: {
    body: Express.Multer.File;
    tags: string;
    bucket: string;
    key: string;
    cacheControl?: string;
  }): Promise<FnResult<null>> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Key: key,
          Tagging: tags,
          Bucket: bucket,
          Body: body.buffer,
          ContentType: body.mimetype,
          CacheControl: cacheControl,
        }),
      );

      return { success: true, error: null, data: null };
    } catch (error) {
      return { success: false, error: makeError(error), data: null };
    }
  }

  async generatePresignedGetUrl({
    key,
    ttl,
    bucket,
  }: {
    key: string;
    ttl: number;
    bucket: string;
  }): Promise<FnResult<string>> {
    try {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: ttl,
      });

      return { data: url, error: null, success: true };
    } catch (error) {
      return { error: makeError(error), data: null, success: false };
    }
  }

  onModuleDestroy() {
    this.s3Client.destroy();
  }
}
