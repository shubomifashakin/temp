import { type Response } from 'express';
import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { LinksService } from './links.service';
import { LinkDetailsDto } from '../dtos/link-details.dto';
import { GetLinkFileDto } from '../dtos/get-link-file.dto';

@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @ApiOperation({ summary: 'Get link details' })
  @ApiResponse({ status: 200, type: LinkDetailsDto })
  @ApiResponse({ status: 404, description: 'Link does not exist' })
  @Get(':linkId')
  async getLinkDetails(@Param('linkId') linkId: string) {
    return this.linksService.getLinkDetails(linkId);
  }

  @ApiOperation({
    summary: 'Get linked file',
    description: 'Redirects to the file URL',
  })
  @ApiBody({ type: GetLinkFileDto })
  @ApiResponse({ status: 302, description: 'Redirects to the file URL' })
  @ApiResponse({ status: 404, description: 'Link does not exist' })
  @Post(':linkId')
  async getLinkFile(
    @Res() res: Response,
    @Body() dto: GetLinkFileDto,
    @Param('linkId') linkId: string,
  ) {
    const url = await this.linksService.getLinkFile(linkId, dto);

    res.redirect(302, url.fileUrl);
  }
}
