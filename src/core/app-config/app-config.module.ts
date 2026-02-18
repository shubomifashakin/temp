import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { ConfigModule } from '@nestjs/config';
import { validateConfig } from '../../common/utils';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: false,
      validate: (config) => {
        validateConfig(config);

        return config;
      },
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
