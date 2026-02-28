import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { LinksService } from './links.service';
import { LinkDetailsDto } from '../dtos/link-details.dto';
import { GetLinkFileDto } from '../dtos/get-link-file.dto';
import { GetLinkFileResponse } from './dtos/get-link-file-response.dto';

@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @ApiOperation({ summary: 'Get link details' })
  @ApiResponse({ status: 200, type: LinkDetailsDto })
  @ApiResponse({ status: 404, description: 'Link does not exist' })
  @Get(':shareId')
  async getLinkDetails(
    @Param('shareId') shareId: string,
  ): Promise<LinkDetailsDto> {
    return this.linksService.getLinkDetails(shareId);
  }

  @ApiOperation({
    summary: 'Get linked file',
    description: 'Returns the file URL',
  })
  @ApiBody({ type: GetLinkFileDto })
  @ApiResponse({ status: 200, type: GetLinkFileResponse })
  @ApiResponse({ status: 401, description: 'Invalid password' })
  @ApiResponse({ status: 400, description: 'Link has been revoked' })
  @ApiResponse({ status: 404, description: 'Link does not exist' })
  @Post(':shareId')
  async getLinkFile(
    @Body() dto: GetLinkFileDto,
    @Param('shareId') shareId: string,
  ): Promise<GetLinkFileResponse> {
    const url = await this.linksService.getLinkFile(shareId, dto);

    return url;
  }
}
