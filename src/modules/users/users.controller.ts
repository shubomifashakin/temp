import { type Response, type Request } from 'express';

import {
  ApiBody,
  ApiResponse,
  ApiOperation,
  ApiCookieAuth,
} from '@nestjs/swagger';
import {
  Body,
  Get,
  Req,
  Res,
  Patch,
  Logger,
  Delete,
  HttpCode,
  UseGuards,
  Controller,
  InternalServerErrorException,
} from '@nestjs/common';

import { UsersService } from './users.service';

import { UserInfo } from './dtos/user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';

import { TOKEN } from '../../common/constants';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AppConfigService } from '../../core/app-config/app-config.service';

@UseGuards(AuthGuard)
@ApiCookieAuth('access_token')
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly UsersService: UsersService,
    private readonly configService: AppConfigService,
  ) {}

  @ApiOperation({ summary: 'Get logged in users info' })
  @ApiResponse({ status: 200, description: 'Success', type: UserInfo })
  @ApiResponse({ status: 404, description: 'User does not exist' })
  @Get('me')
  async getMyInfo(@Req() req: Request): Promise<UserInfo> {
    return this.UsersService.getMyInfo(req.user.id);
  }

  @HttpCode(200)
  @ApiOperation({ summary: 'Update logged in users info' })
  @ApiResponse({ status: 200, description: 'Success' })
  @ApiResponse({ status: 404, description: 'User does not exist' })
  @ApiBody({ type: UpdateUserDto })
  @Patch('me')
  async updateMyInfo(@Req() req: Request, @Body() dto: UpdateUserDto) {
    return this.UsersService.updateMyInfo(req.user.id, dto);
  }

  @ApiResponse({
    status: 200,
    description: 'Users account deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'User was not found' })
  @ApiOperation({ summary: 'Deletes logged in users account permanently' })
  @HttpCode(200)
  @Delete('me')
  async deleteMyInfo(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const response = await this.UsersService.deleteMyInfo(req.user.id);

    const domain = this.configService.Domain;
    if (!domain.success) {
      this.logger.error({
        message: 'Domain not configured',
        error: domain.error,
      });

      throw new InternalServerErrorException();
    }

    res.clearCookie(TOKEN.ACCESS.TYPE, {
      domain: domain.data,
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });

    res.clearCookie(TOKEN.REFRESH.TYPE, {
      domain: domain.data,
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });

    return response;
  }
}
