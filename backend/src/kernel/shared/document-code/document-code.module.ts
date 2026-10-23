import { Module } from '@nestjs/common';

import { DocumentCodeService } from '@shared/document-code/document-code.service';

@Module({
  providers: [DocumentCodeService],
  exports: [DocumentCodeService],
})
export class DocumentCodeModule {}
