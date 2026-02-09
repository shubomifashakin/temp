import { type Response, type Request } from 'express';

import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { UsersService } from './users.service';

import { CachedUserInfo } from './entities/user.dto';
import { UpdateUserDto } from './entities/update-user.dto';

import { TOKEN } from '../../common/constants';
import { AuthGuard } from '../../common/guards/auth.guard';

@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly configService: ConfigService,
    private readonly UsersService: UsersService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get logged in users info' })
  @ApiResponse({ status: 200, description: 'Success', type: CachedUserInfo })
  @ApiResponse({ status: 404, description: 'User does not exist' })
  async getMyInfo(@Req() req: Request) {
    return this.UsersService.getMyInfo(req.user.id);
  }

  @Patch('me')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update logged in users info' })
  @ApiResponse({ status: 200, description: 'Success', type: CachedUserInfo })
  @ApiResponse({ status: 404, description: 'User does not exist' })
  async updateMyInfo(@Req() req: Request, @Body() dto: UpdateUserDto) {
    return this.UsersService.updateMyInfo(req.user.id, dto);
  }

  @Delete('me')
  @HttpCode(200)
  @ApiResponse({
    status: 200,
    description: 'Users account deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'User was not found' })
  @ApiOperation({ summary: 'Deletes logged in users account permanently' })
  async deleteMyInfo(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const response = await this.UsersService.deleteMyInfo(req.user.id);

    const domain = this.configService.getOrThrow<string>('DOMAIN');

    res.clearCookie(TOKEN.ACCESS.TYPE, {
      domain: domain,
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });

    res.clearCookie(TOKEN.REFRESH.TYPE, {
      domain: domain,
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });

    return response;
  }
}
