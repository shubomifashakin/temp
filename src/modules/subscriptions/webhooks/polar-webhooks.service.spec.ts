import { Test, TestingModule } from '@nestjs/testing';
import { PolarWebhooksService } from './polar-webhooks.service';

describe('PolarWebhooksService', () => {
  let service: PolarWebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PolarWebhooksService],
    }).compile();

    service = module.get<PolarWebhooksService>(PolarWebhooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
