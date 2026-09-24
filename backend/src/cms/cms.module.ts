import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { AdminCmsController, PublicCmsController } from './cms.controller';
import { Banner, BannerSchema, Faq, FaqSchema, SocialLink, SocialLinkSchema } from './cms.schema';
import { CmsService } from './cms.service';
@Module({imports:[AuthModule,AdminModule,MongooseModule.forFeature([{name:Banner.name,schema:BannerSchema},{name:Faq.name,schema:FaqSchema},{name:SocialLink.name,schema:SocialLinkSchema}])],controllers:[AdminCmsController,PublicCmsController],providers:[CmsService]}) export class CmsModule {}
