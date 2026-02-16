import { type Request, type Response } from 'express';

import {
  ApiBody,
  ApiQuery,
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
  Query,
  Delete,
  UseGuards,
  Controller,
  ParseIntPipe,
} from '@nestjs/common';

import { SubscriptionsService } from './subscriptions.service';

import { CreatePolarCheckoutDto } from './common/dtos/create-polar-checkout.dto';
import { PolarPlanResponseDto } from './common/dtos/polar-plans-response.dto';

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
  @Delete()
  async cancelSubscription(@Req() req: Request) {
    return this.subscriptionsService.cancelSubscription(req.user.id);
  }

  @ApiOperation({ summary: 'Get available polar subscription plans' })
  @ApiResponse({
    status: 200,
    type: PolarPlanResponseDto,
    description: 'The available plans',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'pagination cursor',
    type: 'number',
  })
  @Get('plans/polar')
  async getPolarPlans(
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ): Promise<PolarPlanResponseDto> {
    return this.subscriptionsService.getPolarPlans(cursor);
  }

  @ApiOperation({ summary: 'Create Polar checkout' })
  @ApiBody({ type: CreatePolarCheckoutDto })
  @ApiTemporaryRedirectResponse({ description: 'Redirects to Polar checkout' })
  @ApiBadRequestResponse({
    description: 'User already has an active subscription',
  })
  @ApiNotFoundResponse({
    description: 'The product that was being checkouted does not exist.',
  })
  @Post('checkout/polar')
  async createPolarCheckout(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: CreatePolarCheckoutDto,
  ) {
    const result = await this.subscriptionsService.createPolarCheckout(
      req.user.id,
      dto,
    );

    return res.redirect(302, result.url);
  }
}
