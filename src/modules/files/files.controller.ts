import { type Request } from 'express';

import {
  Req,
  Get,
  Body,
  Post,
  Param,
  Patch,
  Query,
  Delete,
  Logger,
  UseGuards,
  Controller,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
  InternalServerErrorException,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiOperation,
  ApiConsumes,
  ApiBadRequestResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';

import { FilesService } from './files.service';

import { PLAN_INFO } from './common/constants';
import { GetFileDto } from './dtos/get-file.dto';
import { UploadFileDto } from './dtos/upload-file.dto';

import { AuthGuard } from '../../common/guards/auth.guard';
import { SubscriptionPlanInterceptor } from '../../common/interceptors/subscription.interceptor';

import { UpdateFileDto } from './dtos/update-file.dto';
import { CreateLinkDto } from './dtos/create-link.dto';
import { UpdateLinkDto } from './dtos/update-link.dto';
import { GetFilesResponseDto } from './dtos/get-files-response.dto';
import { CreateLinkResponseDto } from './dtos/create-link-response.dto';
import { GetFileLinksResponseDto } from './dtos/get-file-links-response.dto';
import { UploadFile } from './common/decorators/upload-file.decorator';

@ApiCookieAuth('access_token')
@UseGuards(AuthGuard)
@Controller('files')
export class FilesController {
  private readonly logger = new Logger(FilesController.name);
  constructor(private readonly filesService: FilesService) {}

  @UseInterceptors(SubscriptionPlanInterceptor)
  @ApiOperation({ summary: 'Upload a file' })
  @ApiResponse({ status: 201, description: 'File was successfully uploaded' })
  @ApiBadRequestResponse({ description: 'Bad request' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'File upload data with metadata',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'The file to upload',
        },
        description: {
          type: 'string',
          minLength: 5,
          maxLength: 100,
          description: 'The description of file that was uploaded',
          example: 'My yearbook photo',
        },
        name: {
          type: 'string',
          minLength: 5,
          maxLength: 50,
          description: 'The name of the file',
          example: 'Yearbook',
          pattern: '^[a-zA-Z0-9\\s\\-_]+$',
        },
        lifetime: {
          type: 'string',
          enum: ['short', 'medium', 'long'],
          description: 'How long the file should be stored',
          example: 'long',
        },
      },
      required: ['file', 'description', 'lifetime', 'name'],
    },
  })
  @UploadFile()
  @Post()
  async uploadFile(
    @Req() req: Request,
    @Body() body: UploadFileDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!req.user.plan) {
      this.logger.error({
        message: 'User plan is undefined',
        error: new Error('User plan was not attached to request'),
      });
      throw new InternalServerErrorException();
    }

    if (!PLAN_INFO[req.user.plan].ALLOWED_LIFETIMES.includes(body.lifetime)) {
      throw new BadRequestException(
        `${req.user.plan} users cannot upload files with ${body.lifetime} lifetime`,
      );
    }

    if (file.size > PLAN_INFO[req.user.plan].MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `${req.user.plan} users cannot upload files larger than ${PLAN_INFO[req.user.plan].MAX_FILE_SIZE_MB}MB`,
      );
    }

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
  @ApiResponse({ status: 400, description: 'Bad request' })
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
  @ApiResponse({ status: 400, description: 'Bad request' })
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
}
