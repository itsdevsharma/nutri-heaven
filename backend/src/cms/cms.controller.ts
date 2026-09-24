import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminRole } from '../admin/admin.schema';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CmsService } from './cms.service';
type Kind = 'banners'|'faqs'|'socials';
@Controller('storefront/cms') export class PublicCmsController { constructor(private readonly cms:CmsService) {} @Get() get(){return this.cms.listPublic();} }
@Controller('admin/cms') @UseGuards(AdminAuthGuard,RolesGuard) @Roles(AdminRole.SUPER_ADMIN)
export class AdminCmsController { constructor(private readonly cms:CmsService) {} @Get(':kind') list(@Param('kind') kind:Kind){return this.cms.list(this.kind(kind));} @Post(':kind') create(@Param('kind') kind:Kind,@Body() body:Record<string,unknown>){return this.cms.create(this.kind(kind),body);} @Patch(':kind/:id') update(@Param('kind') kind:Kind,@Param('id') id:string,@Body() body:Record<string,unknown>){return this.cms.update(this.kind(kind),id,body);} @Delete(':kind/:id') remove(@Param('kind') kind:Kind,@Param('id') id:string){return this.cms.remove(this.kind(kind),id);} private kind(kind:string):Kind {if(kind==='banners'||kind==='faqs'||kind==='socials')return kind; throw new NotFoundException();} }
