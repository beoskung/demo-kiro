import { Module } from '@nestjs/common';
import { MasterDataController } from './master-data.controller.js';

@Module({
  controllers: [MasterDataController],
})
export class MasterDataModule {}
