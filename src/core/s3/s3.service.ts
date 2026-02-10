import { ConfigService } from '@nestjs/config';
import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

  onModuleDestroy() {
    this.s3Client.destroy();
  }
}
