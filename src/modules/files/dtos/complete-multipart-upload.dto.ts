import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, Max, ValidateNested } from 'class-validator';

class PartDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(10000)
  partNumber: number;

  @ApiProperty({ example: '"a54357aff0632cce46d942af68356b38"' })
  @IsString()
  etag: string;
}

export class CompleteMultipartUploadDto {
  @ApiProperty({ type: [PartDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartDto)
  parts: PartDto[];
}
