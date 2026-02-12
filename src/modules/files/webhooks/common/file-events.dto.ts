import { ApiProperty } from '@nestjs/swagger';

import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsString,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';

export const FileEvents = {
  deleted: 'file:deleted',
  validated: 'file:validated',
} as const;

export type FileEvents = (typeof FileEvents)[keyof typeof FileEvents];

export class FileDeletedEventPayload {
  @ApiProperty({ description: 'the s3 key of the file' })
  @IsString({ message: 'key should be a string' })
  keys: string[];

  @ApiProperty({ description: 'the date the file was deleted' })
  @IsDate({ message: 'deleted_at should be a valid date' })
  deleted_at: Date;
}

export class FileValidatedEventPayload {
  @ApiProperty({
    example: true,
    description: 'status of the validation, if it was safe or not',
  })
  @IsBoolean({ message: 'safe should be a boolean' })
  safe: boolean;

  @ApiProperty({ description: 'The name that was assigned to the file' })
  @IsString({ message: 'fileName should be a string' })
  fileName: string;
}

export class FileEventsDto {
  @ApiProperty({
    type: FileEvents,
    enumName: 'FileEvents',
    example: FileEvents.deleted,
    description: 'The type of event this is',
  })
  @IsEnum(FileEvents, { message: 'invalid eventype' })
  eventType: FileEvents;

  @ApiProperty({
    description: 'The payload data for the event',
    oneOf: [
      { $ref: '#/components/schemas/FileDeletedEventPayload' },
      { $ref: '#/components/schemas/FileValidatedEventPayload' },
    ],
  })
  @IsNotEmpty({ message: 'data payload cannot be empty' })
  @ValidateNested({ message: 'data payload must be valid' })
  data: FileDeletedEventPayload | FileValidatedEventPayload;
}
