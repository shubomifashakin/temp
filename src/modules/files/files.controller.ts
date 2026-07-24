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
  ParseUUIDPipe,
  BadRequestException,
  InternalServerErrorException,
  PayloadTooLargeException,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiOperation,
  ApiCookieAuth,
  ApiBadRequestResponse,
  ApiPayloadTooLargeResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

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
import { CreateLinkGuard } from './common/guards/create-link.guard';
import {
  PresignedPostResponseDto,
  MultipartInitiatedResponseDto,
} from './dtos/upload-file-response.dto';
import { SignPartDto } from './dtos/sign-part.dto';
import { CompleteMultipartUploadDto } from './dtos/complete-multipart-upload.dto';

@ApiCookieAuth('access_token')
@UseGuards(AuthGuard)
@Controller('files')
export class FilesController {
  private readonly logger = new Logger(FilesController.name);
  constructor(private readonly filesService: FilesService) {}

  @Throttle({ default: { limit: 10, ttl: 60 } })
  @UseInterceptors(SubscriptionPlanInterceptor)
  @ApiOperation({
    summary: 'Request an upload URL',
    description:
      'Returns a presigned POST URL for files ≤500MB, or a multipart upload initiation response for larger files. Check the `type` field to determine which flow to use.',
  })
  @ApiResponse({
    status: 201,
    description: 'Presigned POST upload URL (files ≤500MB)',
    type: PresignedPostResponseDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Multipart upload initiated (files >500MB)',
    type: MultipartInitiatedResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Bad request' })
  @ApiPayloadTooLargeResponse({
    description: 'File too large',
  })
  @ApiBody({
    type: UploadFileDto,
    description: 'File upload data with metadata',
  })
  @Post()
  async generateUploadUrl(
    @Req() req: Request,
    @Body() body: UploadFileDto,
  ): Promise<MultipartInitiatedResponseDto | PresignedPostResponseDto> {
    if (!req.user.plan) {
      this.logger.error({
        message: 'User plan is undefined',
        error: new Error('User plan was not attached to request'),
      });
      throw new InternalServerErrorException();
    }

    if (!PLAN_INFO[req.user.plan].ALLOWED_LIFETIMES.includes(body.lifetime)) {
      throw new BadRequestException(
        'This lifetime option requires a higher plan. Please upgrade your plan.',
      );
    }

    if (body.fileSizeBytes > PLAN_INFO[req.user.plan].MAX_FILE_SIZE_BYTES) {
      throw new PayloadTooLargeException(
        'File size exceeds your plan limit. Please upgrade your plan.',
      );
    }

    return this.filesService.generateUploadUrl(body, req.user.id);
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
  @UseGuards(CreateLinkGuard)
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

  @ApiOperation({ summary: 'Sign a presigned URL for a single multipart part' })
  @ApiParam({
    name: 'id',
    description: 'File id returned from upload initiation',
  })
  @ApiBody({ type: SignPartDto })
  @ApiResponse({ status: 201, description: 'Presigned URL for the part' })
  @ApiResponse({ status: 404, description: 'Multipart upload not found' })
  @Post(':id/parts')
  async signMultipartPart(
    @Req() req: Request,
    @Param('id') fileId: string,
    @Body() dto: SignPartDto,
  ) {
    return this.filesService.signMultipartPart(
      req.user.id,
      fileId,
      dto.partNumber,
    );
  }

  @ApiOperation({ summary: 'Complete a multipart upload' })
  @ApiParam({ name: 'id', description: 'File id' })
  @ApiBody({ type: CompleteMultipartUploadDto })
  @ApiResponse({ status: 201, description: 'Upload completed' })
  @ApiResponse({ status: 404, description: 'Multipart upload not found' })
  @Post(':id/complete')
  async completeMultipartUpload(
    @Req() req: Request,
    @Param('id') fileId: string,
    @Body() dto: CompleteMultipartUploadDto,
  ) {
    return this.filesService.completeMultipartUpload(
      req.user.id,
      fileId,
      dto.parts,
    );
  }

  @ApiOperation({
    summary: 'Abort a multipart upload and delete the file record',
  })
  @ApiParam({ name: 'id', description: 'File id' })
  @ApiResponse({ status: 200, description: 'Upload aborted' })
  @ApiResponse({ status: 404, description: 'Multipart upload not found' })
  @Delete(':id/multipart')
  async abortMultipartUpload(@Req() req: Request, @Param('id') fileId: string) {
    return this.filesService.abortMultipartUpload(req.user.id, fileId);
  }
}
