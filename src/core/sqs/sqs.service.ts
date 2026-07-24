import { Injectable, OnModuleDestroy } from '@nestjs/common';

import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';

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

  async receiveMessages({
    queueUrl,
    maxMessages = 1,
  }: {
    queueUrl: string;
    maxMessages?: number;
  }): Promise<FnResult<Array<{ body: string; receiptHandle: string }>>> {
    try {
      const result = await this.sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: maxMessages,
          WaitTimeSeconds: 20,
        }),
      );

      const messages = (result.Messages ?? []).map((m) => ({
        body: m.Body!,
        receiptHandle: m.ReceiptHandle!,
      }));

      return { success: true, data: messages, error: null };
    } catch (error) {
      return { success: false, error: makeError(error), data: null };
    }
  }

  async deleteMessage({
    queueUrl,
    receiptHandle,
  }: {
    queueUrl: string;
    receiptHandle: string;
  }): Promise<FnResult<null>> {
    try {
      await this.sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
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
