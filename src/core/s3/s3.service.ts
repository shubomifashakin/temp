import { ConfigService } from '@nestjs/config';
import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { makeError } from '../../common/utils';
import { FnResult } from '../../types/common.types';

@Injectable()
export class S3Service implements OnModuleDestroy {
  private readonly s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: configService.getOrThrow('AWS_REGION'),
      credentials: {
        accessKeyId: configService.getOrThrow('AWS_ACCESS_KEY'),
        secretAccessKey: configService.getOrThrow('AWS_SECRET_KEY'),
      },
    });
  }

  async uploadToS3({
    body,
    tags,
    bucket,
    key,
  }: {
    body: Express.Multer.File;
    tags: string;
    bucket: string;
    key: string;
  }): Promise<FnResult<null>> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Key: key,
          Tagging: tags,
          Bucket: bucket,
          Body: body.buffer,
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
