import { ApiProperty } from '@nestjs/swagger';

export enum UploadResponseType {
  PresignedPost = 'presigned-post',
  Multipart = 'multipart',
}

export class PresignedPostResponseDto {
  @ApiProperty({
    enum: UploadResponseType,
    example: UploadResponseType.PresignedPost,
  })
  type: UploadResponseType.PresignedPost;

  @ApiProperty({
    description: 'The url to upload the file to.',
    example: 'https://s3.amazonaws.com/bucket/key',
  })
  url: string;

  @ApiProperty({
    description: 'The fields to send as form data alongside the file.',
    example: { key: 'value' },
  })
  fields: Record<string, string>;
}

export class MultipartInitiatedResponseDto {
  @ApiProperty({
    enum: UploadResponseType,
    example: UploadResponseType.Multipart,
  })
  type: UploadResponseType.Multipart;

  @ApiProperty({ example: '12345678-1234-1234-1234-123456789012' })
  fileId: string;

  @ApiProperty({ example: 'uploads/userId/uuid' })
  key: string;

  @ApiProperty({ example: 'abc123uploadId' })
  uploadId: string;
}
