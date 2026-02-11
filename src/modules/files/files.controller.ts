import { type Response, type Request } from 'express';

import {
  Req,
  Get,
  Res,
  Body,
  Post,
  Param,
  Patch,
  Query,
  Delete,
  HttpCode,
  UseGuards,
  Controller,
  UploadedFile,
  ParseUUIDPipe,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { memoryStorage } from 'multer';

import { FilesService } from './files.service';

import { GetFileDto } from './dtos/get-file.dto';
import { UploadFileDto } from './dtos/upload-file.dto';

import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from './common/constants';

import { AuthGuard } from '../../common/guards/auth.guard';
import { Public } from '../../common/decorators/public.decorator';

import { GenerateLinkDto } from './dtos/generate-link.dto';
import { GetSharedFile } from './dtos/get-shared-file.dto';
import { ShareLinkDetailsDto } from './dtos/share-link-details.dto';

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

  @ApiOperation({
    summary: 'Get list of files',
    description: 'Get files metadata in chunks',
  })
  @ApiQuery({
    description: 'Cursor to start from',
    name: 'cursor',
  })
  @ApiResponse({ status: 200, description: 'Files retrieved' })
  @Get()
  getFiles(
    @Req() req: Request,
    @Query('cursor', ParseUUIDPipe) cursor?: string,
  ) {
    return this.filesService.getFiles(req.user.id, cursor);
  }

  @ApiResponse({ status: 200, type: GetFileDto })
  @ApiResponse({ status: 404, description: 'File does not exist' })
  @ApiOperation({ summary: 'Get metadata of a single file' })
  @ApiParam({
    description: 'Id of the file to be gotten',
    name: 'id',
  })
  @Get(':id')
  getSingleFile(@Req() req: Request, @Param('id') fileId: string) {
    return this.filesService.getSingleFile(req.user.id, fileId);
  }

  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'File does not exist' })
  @ApiOperation({ summary: 'Delete a file immediately' })
  @ApiParam({
    description: 'Id of the file to be deleted',
    name: 'id',
  })
  @Delete(':id')
  deleteSingleFile(@Req() req: Request, @Param('id') fileId: string) {
    return this.filesService.deleteSingleFile(req.user.id, fileId);
  }

  @ApiResponse({ status: 200, type: GetFileDto })
  @ApiResponse({ status: 404, description: 'File does not exist' })
  @ApiOperation({
    summary: 'Update the description of a file',
  })
  @ApiParam({
    description: 'Id of the file to be updated',
    name: 'id',
  })
  @Patch(':id')
  updateSingleFile(
    @Req() req: Request,
    @Param('id') fileId: string,
    @Body() dto: UploadFileDto,
  ) {
    return this.filesService.updateSingleFile(req.user.id, fileId, dto);
  }

  //FIXME: ADD RESPONSE DTO
  @ApiOperation({ summary: 'Generate share link for a file' })
  @ApiParam({
    name: 'id',
    description: 'Id of the file to generate share link for',
  })
  @Post(':id/share')
  async generateShareLink(
    @Req() req: Request,
    @Param('id') fileId: string,
    dto: GenerateLinkDto,
  ) {
    return this.filesService.generateShareLink(req.user.id, fileId, dto);
  }

  //FIXME: ADD RESPONSE DTO
  @ApiOperation({ summary: 'Get share links for a file' })
  @ApiParam({
    name: 'id',
    description: 'Id of the file to get share links for',
  })
  @Get(':id/share')
  async getFileShareLinks(
    @Req() req: Request,
    @Param('id') fileId: string,
    @Query('cursor', ParseUUIDPipe) cursor?: string,
  ) {
    return this.filesService.getFileShareLinks(req.user.id, fileId, cursor);
  }

  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'File does not exist' })
  @ApiOperation({ summary: 'Revoke a share link' })
  @ApiParam({
    name: 'id',
    description: 'Id of the file to revoke share link for',
  })
  @ApiParam({
    name: 'shareId',
    description: 'Id of the share link to revoke',
  })
  @Delete(':id/share/:shareId')
  async revokeShareLink(
    @Req() req: Request,
    @Param('id') fileId: string,
    @Param('shareId') shareId: string,
  ) {
    return this.filesService.revokeShareLink(req.user.id, fileId, shareId);
  }

  @ApiOperation({ summary: 'Get share link details' })
  @ApiResponse({ status: 200, type: ShareLinkDetailsDto })
  @ApiResponse({ status: 404, description: 'Share link does not exist' })
  @Public()
  @Get('share/:shareId')
  async getShareLinkDetails(@Param('shareId') shareId: string) {
    return this.filesService.getShareLinkDetails(shareId);
  }

  @ApiOperation({
    summary: 'Get shared file',
    description: 'Redirects to the file URL',
  })
  @ApiResponse({ status: 302, description: 'Redirects to the file URL' })
  @ApiResponse({ status: 404, description: 'Share link does not exist' })
  @Public()
  @Post('share/:shareId')
  async getSharedFile(
    @Res() res: Response,
    @Body() dto: GetSharedFile,
    @Param('shareId') shareId: string,
  ) {
    const url = await this.filesService.getSharedFile(shareId, dto);

    res.redirect(302, url.fileUrl);
  }
}
