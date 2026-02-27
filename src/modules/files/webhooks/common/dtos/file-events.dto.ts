/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsString,
  IsNotEmpty,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';

export const FileEvents = {
  deleted: 'file:deleted',
  validated: 'file:validated',
} as const;

export type FileEvents = (typeof FileEvents)[keyof typeof FileEvents];

export class FileDeletedEventPayload {
  @ApiProperty({ description: 'the s3 keys of the files', type: [String] })
  @IsArray({ message: 'keys should be an array' })
  @IsString({ each: true, message: 'each key should be a string' })
  keys: string[];

  @ApiProperty({ description: 'the date the file was deleted' })
  @Type(() => Date)
  @IsDate({ message: 'deletedAt should be a valid date' })
  deletedAt: Date;
}

export class FileValidatedEventPayload {
  @ApiProperty({
    example: true,
    description: 'status of the validation, if it was infected or not',
  })
  @IsBoolean({ message: 'infected should be a boolean' })
  infected: boolean;

  @ApiProperty({ description: 'The s3 key of the file' })
  @IsString({ message: 'key should be a string' })
  key: string;
}

export class FileEventsDto {
  @ApiProperty({
    enum: FileEvents,
    enumName: 'FileEvents',
    example: FileEvents.deleted,
    description: 'The type of event this is',
  })
  @IsEnum(FileEvents, { message: 'invalid event type' })
  type: FileEvents;

  @ApiProperty({
    description: 'The timestamp of the event',
  })
  @IsDate({ message: 'timestamp should be a valid date' })
  @Type(() => Date)
  timestamp: Date;

  @ApiProperty({
    description: 'The payload data for the event',
    oneOf: [
      { $ref: '#/components/schemas/FileDeletedEventPayload' },
      { $ref: '#/components/schemas/FileValidatedEventPayload' },
    ],
    discriminator: {
      propertyName: 'type',
      mapping: {
        'file:deleted': '#/components/schemas/FileDeletedEventPayload',
        'file:validated': '#/components/schemas/FileValidatedEventPayload',
      },
    },
  })
  @IsNotEmpty({ message: 'data payload cannot be empty' })
  @Transform(({ value, obj }) => {
    if (obj.type === FileEvents.deleted) {
      return plainToInstance(FileDeletedEventPayload, value);
    }
    if (obj.type === FileEvents.validated) {
      return plainToInstance(FileValidatedEventPayload, value);
    }
    return value;
  })
  @ValidateNested()
  @Type(() => Object, {
    discriminator: {
      property: 'type',
      subTypes: [
        { value: FileDeletedEventPayload, name: FileEvents.deleted },
        { value: FileValidatedEventPayload, name: FileEvents.validated },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  data: FileDeletedEventPayload | FileValidatedEventPayload;
}
