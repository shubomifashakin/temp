import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

import { makeError } from '../../common/utils';
import { FnResult } from '../../types/common.types';
import { AppConfigService } from '../app-config/app-config.service';

@Injectable()
export class SqsService implements OnModuleDestroy {
  private readonly sqsClient: SQSClient;

  constructor(private readonly configService: AppConfigService) {
    if (
      !configService.AwsRegion.success ||
      !configService.AwsAccessKey.success ||
      !configService.AwsSecretKey.success
    ) {
      throw new Error('AWS region, access key, or secret key not found');
    }

    this.sqsClient = new SQSClient({
      region: configService.AwsRegion.data,
      credentials: {
        accessKeyId: configService.AwsAccessKey.data,
        secretAccessKey: configService.AwsSecretKey.data,
      },
    });
  }

  async pushMessage({
    queueUrl,
    message,
  }: {
    queueUrl: string;
    message: object;
  }): Promise<FnResult<null>> {
    try {
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(message),
        }),
      );

      return { success: true, error: null, data: null };
    } catch (error) {
      return { success: false, error: makeError(error), data: null };
    }
  }

  onModuleDestroy() {
    this.sqsClient.destroy();
  }
}
