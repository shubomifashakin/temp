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

import {
  ApiQuery,
  ApiResponse,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { CliService } from './cli.service';
import { AuthGuard } from '../../../common/guards/auth.guard';

import { CliAuthInitResponse } from './dto/init-response.dto';
import { CliGetTokenResponseDto } from './dto/get-token-response.dto';

@Controller('auth/cli')
export class CliController {
  private readonly logger = new Logger(CliController.name);

  constructor(private readonly cliService: CliService) {}

  @ApiOperation({ description: 'Initiate CLI authentication' })
  @ApiQuery({
    name: 'state',
    required: true,
    description:
      'State parameter for CLI authentication. Provided by the client to prevent CSRF attacks.',
  })
  @ApiResponse({
    status: 200,
    description: 'The oauth code',
    type: CliAuthInitResponse,
  })
  @Post('initiate')
  init(@Query('state') state: string): Promise<CliAuthInitResponse> {
    return this.cliService.init(state);
  }

  @ApiOperation({ description: 'Confirm CLI authentication' })
  @ApiQuery({
    name: 'code',
    required: true,
    description: 'Code parameter for CLI authentication.',
  })
  @ApiQuery({
    name: 'state',
    required: true,
    description:
      'State parameter for CLI authentication. Provided by the client to prevent CSRF attacks.',
  })
  @ApiResponse({ status: 200, description: 'Success' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Post('confirm')
  confirm(
    @Req() req: Request,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return this.cliService.confirm(req.user.id, code, state);
  }

  @ApiOperation({ description: 'Get CLI token' })
  @ApiQuery({
    name: 'code',
    required: true,
    description: 'Code parameter for CLI authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
    type: CliGetTokenResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Post('token')
  getToken(@Query('code') code: string): Promise<CliGetTokenResponseDto> {
    return this.cliService.getToken(code);
  }

  @ApiOperation({ description: 'Logout from the CLI' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Success' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
