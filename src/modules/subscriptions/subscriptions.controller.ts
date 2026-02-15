import { type Request, type Response } from 'express';

import {
  ApiBody,
  ApiQuery,
  ApiResponse,
  ApiOperation,
  ApiCookieAuth,
  ApiTemporaryRedirectResponse,
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

import { AuthGuard } from '../../common/guards/auth.guard';
import { PolarPlanResponseDto } from './common/dtos/polar-plans-response.dto';

@ApiCookieAuth('access_token')
@UseGuards(AuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @ApiOperation({
    summary: 'Cancel a users active subscription once the period is over',
  })
  @ApiResponse({ description: 'subscription cancelled', status: 201 })
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
  @ApiTemporaryRedirectResponse({ description: 'Redirect to Polar checkout' })
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
