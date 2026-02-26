import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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

  /**
   *
   * @param key : s3 key
   * @param ttl : time to live in seconds
   * @param tags : tags to be added to the s3 object
   * @param bucket : s3 bucket name
   * @param contentType : content type of the s3 object
   * @param contentLength : content length of the s3 object
   * @returns
   */
  async generatePresignedPostUrl({
    key,
    ttl,
    tags,
    bucket,
    contentType,
    contentLength,
  }: {
    key: string;
    ttl: number;
    bucket: string;
    contentType: string;
    contentLength: number;
    tags: string;
  }): Promise<FnResult<{ url: string; fields: Record<string, string> }>> {
    try {
      const { url, fields } = await createPresignedPost(this.s3Client, {
        Key: key,
        Bucket: bucket,
        Fields: {
          key,
          Tagging: tags,
          'Content-Type': contentType,
        },
        Conditions: [
          ['eq', '$Content-Type', contentType],
          ['content-length-range', 1, contentLength],
        ],
        Expires: ttl,
      });

      return { data: { url, fields }, error: null, success: true };
    } catch (error) {
      return { error: makeError(error), data: null, success: false };
    }
  }

  onModuleDestroy() {
    this.s3Client.destroy();
  }
}
