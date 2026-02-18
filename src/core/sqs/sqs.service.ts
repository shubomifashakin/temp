import { ConfigService } from '@nestjs/config';
import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

import { makeError } from '../../common/utils';
import { FnResult } from '../../types/common.types';

@Injectable()
export class SqsService implements OnModuleDestroy {
  private readonly sqsClient: SQSClient;

  constructor(private readonly configService: ConfigService) {
    this.sqsClient = new SQSClient({
      region: configService.get<string>('AWS_REGION')!,
      credentials: {
        accessKeyId: configService.get<string>('AWS_ACCESS_KEY')!,
        secretAccessKey: configService.get<string>('AWS_SECRET_KEY')!,
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
