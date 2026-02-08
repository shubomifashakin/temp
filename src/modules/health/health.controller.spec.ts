import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('shoudl return the health status', () => {
    const healthDto = controller.getHealth();

    expect(healthDto).toBeDefined();
    expect(healthDto.status).toBe('ok');
    expect(healthDto.timestamp).toBeDefined();
  });
});
