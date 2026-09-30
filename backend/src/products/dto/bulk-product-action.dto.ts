import { ArrayNotEmpty, IsArray, IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';

export enum BulkProductAction { activate = 'activate', deactivate = 'deactivate', archive = 'archive', changeCategory = 'changeCategory', addTags = 'addTags' }

export class BulkProductActionDto {
  @IsEnum(BulkProductAction) action!: BulkProductAction;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) slugs!: string[];
  @IsOptional() @IsMongoId() categoryId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}
