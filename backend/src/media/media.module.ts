import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { MediaController } from './media.controller';
@Module({imports:[AuthModule,AdminModule],controllers:[MediaController]}) export class MediaModule {}
