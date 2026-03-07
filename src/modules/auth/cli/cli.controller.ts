import { type Request } from 'express';

import {
  Req,
  Post,
  Query,
  Logger,
  UseGuards,
  Controller,
  UnauthorizedException,
} from '@nestjs/common';

import { CliService } from './cli.service';
import { AuthGuard } from '../../../common/guards/auth.guard';

@Controller('auth/cli')
export class CliController {
  private readonly logger = new Logger(CliController.name);

  constructor(private readonly cliService: CliService) {}

  @Post('initiate')
  init(@Query('state') state: string) {
    return this.cliService.init(state);
  }

  @UseGuards(AuthGuard)
  @Post('confirm')
  confirm(
    @Req() req: Request,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return this.cliService.confirm(req.user.id, code, state);
  }

  @Post('token')
  getToken(@Query('code') code: string) {
    return this.cliService.getToken(code);
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  logout(@Req() req: Request) {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      this.logger.warn({ message: 'No authorization token found' });

      throw new UnauthorizedException('Unauthorized');
    }

    return this.cliService.logout(token);
  }
}
