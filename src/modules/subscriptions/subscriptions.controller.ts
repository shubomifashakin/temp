import { type Request, type Response } from 'express';

import {
  ApiBody,
  ApiResponse,
  ApiOperation,
  ApiCookieAuth,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import {
  Get,
  Req,
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
import { GetSubscriptionResponse } from './common/dtos/get-subscription.dto';
import { CreateCheckoutResponse } from './common/dtos/create-checkout-response.dto';

@ApiCookieAuth('access_token')
@UseGuards(AuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @ApiOperation({
    summary: "Get the logged in user's currently active subscription",
    description:
      "Get the logged in user's currently active subscription, if any.",
  })
  @ApiResponse({
    description: 'Subscription retrieved',
    status: 200,
    type: GetSubscriptionResponse,
  })
  @Get('current')
  async getCurrentSubscription(
    @Req() req: Request,
  ): Promise<GetSubscriptionResponse> {
    return this.subscriptionsService.getSubscriptionDetails(req.user.id);
  }

  @ApiOperation({
    summary:
      'Cancel the logged in user`s active subscription once the period is over',
    description: `Cancel the logged in user's active subscription once the period is over, it is idempotent. 
      The user's subscription would remain active until its expiry`,
  })
  @ApiResponse({ description: 'Subscription cancelled', status: 200 })
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
  @ApiResponse({
    description: 'Checkout created',
    status: 200,
    type: CreateCheckoutResponse,
  })
  @ApiBadRequestResponse({
    description: 'User already has an active subscription',
  })
  @ApiNotFoundResponse({
    description: 'The product that was being checked out does not exist.',
  })
  @Post('checkout')
  async createCheckout(
    @Req() req: Request,
    @Body() dto: CreateCheckoutDto,
  ): Promise<CreateCheckoutResponse> {
    return await this.subscriptionsService.createCheckout(req.user.id, dto);
  }
}
