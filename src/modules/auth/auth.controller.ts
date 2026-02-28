import { SkipThrottle } from '@nestjs/throttler';
import { type Request, type Response } from 'express';
import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { AppConfigService } from '../../core/app-config/app-config.service';

import { AuthService } from './auth.service';

import { TOKEN } from '../../common/constants';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: AppConfigService,
  ) {}

  @ApiOperation({
    summary: 'To authorize the user via google oauth',
    description: 'Redirects to the authorization page',
  })
  @ApiResponse({ status: 302, description: 'Redirect to authorization page' })
  @Get('google')
  async authorize(@Res() res: Response) {
    const url = await this.authService.authorize();

    res.redirect(url);
  }

  @SkipThrottle()
  @ApiOperation({
    summary: 'Google OAuth callback handler',
    description: 'Handles OAuth callback and sets auth cookies',
  })
  @ApiQuery({
    name: 'state',
    required: true,
    description: 'OAuth state parameter',
  })
  @ApiQuery({
    name: 'code',
    required: true,
    description: 'OAuth authorization code',
  })
  @ApiResponse({ status: 302, description: 'Redirect to dashboard' })
  @Get('google/callback')
  async callback(
    @Res() res: Response,
    @Query('state') state: string,
    @Query('code') code: string,
  ) {
    const userInfo = await this.authService.callback(state, code);

    const frontendUrl = this.configService.FrontendUrl.data!;
    const domain = this.configService.Domain.data!;

    res.cookie(TOKEN.ACCESS.TYPE, userInfo.accessToken, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: TOKEN.ACCESS.EXPIRATION_MS,
      domain: domain,
    });

    res.cookie(TOKEN.REFRESH.TYPE, userInfo.refreshToken, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: TOKEN.REFRESH.EXPIRATION_MS,
      domain: domain,
    });

    res.redirect(302, `${frontendUrl}/dashboard`);
  }

  @ApiOperation({
    summary: 'To logout the user',
  })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const accessToken = req.cookies[TOKEN.ACCESS.TYPE] as string;
    const refreshToken = req.cookies[TOKEN.REFRESH.TYPE] as string;
    await this.authService.logout(accessToken, refreshToken);

    const domain = this.configService.Domain.data!;

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

    return { message: 'success' };
  }

  @ApiOperation({
    summary: 'To refresh the user tokens',
  })
  @ApiCookieAuth('refresh_token')
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized (missing or invalid refresh token)',
  })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies[TOKEN.REFRESH.TYPE] as string;
    const tokens = await this.authService.refresh(refreshToken);

    const domain = this.configService.Domain.data!;

    res.cookie(TOKEN.ACCESS.TYPE, tokens.accessToken, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: TOKEN.ACCESS.EXPIRATION_MS,
      domain: domain,
    });

    res.cookie(TOKEN.REFRESH.TYPE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: TOKEN.REFRESH.EXPIRATION_MS,
      domain: domain,
    });

    return { message: 'success' };
  }
}
