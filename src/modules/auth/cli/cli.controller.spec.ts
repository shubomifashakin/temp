import { Test, TestingModule } from '@nestjs/testing';
import { CliController } from './cli.controller';

describe('CliController', () => {
  let controller: CliController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CliController],
    }).compile();

    controller = module.get<CliController>(CliController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
