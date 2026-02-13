import { type Request, type Response } from 'express';

import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiTemporaryRedirectResponse,
} from '@nestjs/swagger';
import {
  Get,
  Req,
  Res,
  Body,
  Post,
  Query,
  UseGuards,
  Controller,
  ParseIntPipe,
} from '@nestjs/common';

import { SubscriptionsService } from './subscriptions.service';

import { CreatePolarCheckoutDto } from './common/dtos/create-polar-checkout.dto';

import { AuthGuard } from '../../common/guards/auth.guard';

@ApiCookieAuth('access_token')
@UseGuards(AuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  //FIXME: DOCUMENT THIS
  @ApiOperation({ summary: 'Get Polar subscription plans' })
  @Get('plans/polar')
  async getPolarPlans(@Query('cursor', ParseIntPipe) cursor?: number) {
    return this.subscriptionsService.getPolarPlans(cursor);
  }

  @ApiOperation({ summary: 'Create Polar checkout' })
  @ApiBody({ type: CreatePolarCheckoutDto })
  @ApiTemporaryRedirectResponse({ description: 'Redirect to Polar checkout' })
  @Post('checkout/polar')
  async createPolarCheckout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: CreatePolarCheckoutDto,
  ) {
    const result = await this.subscriptionsService.createPolarCheckout(
      req.user.id,
      dto,
    );

    return res.redirect(302, result.url);
  }
}
