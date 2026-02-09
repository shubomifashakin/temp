import { type Request } from 'express';

import {
  Req,
  Get,
  Body,
  Post,
  Param,
  Patch,
  Delete,
  HttpCode,
  UseGuards,
  Controller,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { memoryStorage } from 'multer';

import { FilesService } from './files.service';

import { GetFileDto } from './dtos/get-file.dto';
import { UploadFileDto } from './dtos/upload-file.dto';

import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from './common/constants';

import { AuthGuard } from '../../common/guards/auth.guard';

@UseGuards(AuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @ApiOperation({ summary: 'Upload a file' })
  @ApiResponse({ status: 200, description: 'File was successfully uploaded' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fields: 2,
        fileSize: MAX_FILE_SIZE_BYTES,
      },
      fileFilter: (_, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          return cb(null, false);
        }

        if (typeof file.size === 'number' && file.size > MAX_FILE_SIZE_BYTES) {
          return cb(null, false);
        }

        return cb(null, true);
      },
    }),
  )
  @Post()
  @HttpCode(201)
  async uploadFile(
    @Req() req: Request,
    @Body() body: UploadFileDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.filesService.uploadFile(file, body, req.user.id);
  }

  @ApiOperation({ description: 'Get files metadata in chunks' })
  @Get()
  getFiles(@Req() req: Request) {
    return this.filesService.getFiles(req.user.id);
  }

  @ApiResponse({ status: 200, type: GetFileDto })
  @ApiResponse({ status: 404, description: 'File does not exist' })
  @ApiOperation({ description: 'Get metadata of a single file' })
  @Get(':id')
  getSingleFile(@Req() req: Request, @Param('id') fileId: string) {
    return this.filesService.getSingleFile(req.user.id, fileId);
  }

  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'File does not exist' })
  @ApiOperation({ description: 'Delete a file immediately' })
  @Delete(':id')
  deleteSingleFile(@Req() req: Request, @Param('id') fileId: string) {
    return this.filesService.deleteSingleFile(req.user.id, fileId);
  }

  @ApiResponse({ status: 200, type: GetFileDto })
  @ApiResponse({ status: 404, description: 'File does not exist' })
  @ApiOperation({
    description: 'Update the description of a file',
  })
  @Patch(':id')
  updateSingleFile(
    @Req() req: Request,
    @Param('id') fileId: string,
    @Body() dto: UploadFileDto,
  ) {
    return this.filesService.updateSingleFile(req.user.id, fileId, dto);
  }
}
