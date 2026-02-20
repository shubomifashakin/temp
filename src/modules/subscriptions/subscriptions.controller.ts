import { type Request, type Response } from 'express';

import {
  ApiBody,
  ApiResponse,
  ApiOperation,
  ApiCookieAuth,
  ApiTemporaryRedirectResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import {
  Get,
  Req,
  Res,
  Body,
  Post,
  Delete,
  UseGuards,
  Controller,
} from '@nestjs/common';

import { SubscriptionsService } from './subscriptions.service';

import { CreateCheckoutDto } from './common/dtos/create-checkout.dto';
import { GetPlansResponse } from './common/dtos/get-plans-response.dto';

import { AuthGuard } from '../../common/guards/auth.guard';

@ApiCookieAuth('access_token')
@UseGuards(AuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @ApiOperation({
    summary: 'Cancel a users active subscription once the period is over',
    description: `Cancel a users active subscription once the period is over, it is idempotent. 
      The users subscription would remain active until its expiry`,
  })
  @ApiResponse({ description: 'Subscription cancelled', status: 201 })
  @Delete('current')
  async cancelSubscription(@Req() req: Request) {
    return this.subscriptionsService.cancelSubscription(req.user.id);
  }

  @ApiOperation({
    summary: 'Get available subscription plans across all providers',
  })
  @ApiResponse({
    status: 200,
    type: GetPlansResponse,
    description: 'The available plans across all providers',
  })
  @Get('plans')
  async getPlans(): Promise<GetPlansResponse> {
    return this.subscriptionsService.getPlans();
  }

  @ApiOperation({ summary: 'Create checkout' })
  @ApiBody({ type: CreateCheckoutDto })
  @ApiTemporaryRedirectResponse({ description: 'Redirects to checkout url' })
  @ApiBadRequestResponse({
    description: 'User already has an active subscription',
  })
  @ApiNotFoundResponse({
    description: 'The product that was being checked out does not exist.',
  })
  @Post('checkout')
  async createCheckout(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: CreateCheckoutDto,
  ) {
    const result = await this.subscriptionsService.createCheckout(
      req.user.id,
      dto,
    );

    return res.redirect(302, result.url);
  }
}
