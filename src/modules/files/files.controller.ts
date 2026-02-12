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
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';

import { memoryStorage } from 'multer';

import { FilesService } from './files.service';

import { GetFileDto } from './dtos/get-file.dto';
import { UploadFileDto } from './dtos/upload-file.dto';

import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from './common/constants';

import { AuthGuard } from '../../common/guards/auth.guard';
import { Public } from '../../common/decorators/public.decorator';

import { UpdateFileDto } from './dtos/update-file.dto';
import { CreateLinkDto } from './dtos/create-link.dto';
import { UpdateLinkDto } from './dtos/update-link.dto';
import { LinkDetailsDto } from './dtos/link-details.dto';
import { GetLinkedFileDto } from './dtos/get-linked-file.dto';
import { GetFilesResponseDto } from './dtos/get-files-response.dto';
import { CreateLinkResponseDto } from './dtos/create-link-response.dto';
import { GetFileLinksResponseDto } from './dtos/get-file-links-response.dto';

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
    name: 'cursor',
    required: false,
    description: 'Pagination cursor',
  })
  @ApiResponse({
    status: 200,
    type: GetFilesResponseDto,
    description: 'Files retrieved',
  })
  @Get()
  getFiles(
    @Req() req: Request,
    @Query('cursor', new ParseUUIDPipe({ optional: true, version: '4' }))
    cursor?: string,
  ): Promise<GetFilesResponseDto> {
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
  getSingleFile(
    @Req() req: Request,
    @Param('id') fileId: string,
  ): Promise<GetFileDto> {
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
  @ApiBody({ type: UpdateFileDto })
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
    @Body() dto: UpdateFileDto,
  ): Promise<GetFileDto> {
    return this.filesService.updateSingleFile(req.user.id, fileId, dto);
  }

  @ApiOperation({ summary: 'Create link for a file' })
  @ApiResponse({ status: 200, type: CreateLinkResponseDto })
  @ApiResponse({ status: 404, description: 'File does not exist' })
  @ApiParam({
    name: 'id',
    description: 'Id of the file to create a link for',
  })
  @ApiBody({ type: CreateLinkDto })
  @ApiResponse({
    status: 400,
    description: 'Bad request',
  })
  @ApiResponse({
    status: 404,
    description: 'File does not exist',
  })
  @Post(':id/links')
  async createLink(
    @Req() req: Request,
    @Param('id') fileId: string,
    @Body() dto: CreateLinkDto,
  ): Promise<CreateLinkResponseDto> {
    return this.filesService.createLink(req.user.id, fileId, dto);
  }

  @ApiOperation({ summary: 'Get all links for a file' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Pagination cursor',
  })
  @ApiParam({
    name: 'id',
    description: 'Id of the file to get links for',
  })
  @ApiResponse({
    status: 200,
    type: GetFileLinksResponseDto,
    description: 'List of links that have been created for this file',
  })
  @Get(':id/links')
  async getFileLinks(
    @Req() req: Request,
    @Param('id') fileId: string,
    @Query('cursor', new ParseUUIDPipe({ version: '4', optional: true }))
    cursor?: string,
  ): Promise<GetFileLinksResponseDto> {
    return this.filesService.getFileLinks(req.user.id, fileId, cursor);
  }

  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'File does not exist' })
  @ApiOperation({ summary: 'Revoke a file link' })
  @ApiParam({
    name: 'id',
    description: 'Id of the file to revoke link for',
  })
  @ApiParam({
    name: 'linkId',
    description: 'Id of the link to revoke',
  })
  @Delete(':id/links/:linkId')
  async revokeLink(
    @Req() req: Request,
    @Param('id') fileId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.filesService.revokeLink(req.user.id, fileId, linkId);
  }

  @ApiOperation({ summary: 'Update file link details' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'File does not exist' })
  @ApiParam({
    name: 'id',
    description: 'Id of the file to update link details for',
  })
  @ApiParam({
    name: 'linkId',
    description: 'Id of the link to update',
  })
  @ApiBody({ type: UpdateLinkDto })
  @Patch(':id/links/:linkId')
  async updateLink(
    @Req() req: Request,
    @Body() dto: UpdateLinkDto,
    @Param('id') fileId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.filesService.updateLink(req.user.id, fileId, linkId, dto);
  }

  @ApiOperation({ summary: 'Get file link details' })
  @ApiResponse({ status: 200, type: LinkDetailsDto })
  @ApiResponse({ status: 404, description: 'File link does not exist' })
  @Public()
  @Get('links/:linkId')
  async getLinkDetails(@Param('linkId') linkId: string) {
    return this.filesService.getLinkDetails(linkId);
  }

  @ApiOperation({
    summary: 'Get linked file',
    description: 'Redirects to the file URL',
  })
  @ApiBody({ type: GetLinkedFileDto })
  @ApiResponse({ status: 302, description: 'Redirects to the file URL' })
  @ApiResponse({ status: 404, description: 'File link does not exist' })
  @Public()
  @Post('links/:linkId')
  async getLinkedFile(
    @Res() res: Response,
    @Body() dto: GetLinkedFileDto,
    @Param('linkId') linkId: string,
  ) {
    const url = await this.filesService.getLinkedFile(linkId, dto);

    res.redirect(302, url.fileUrl);
  }
}
