import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContactController } from '@plugins/crm/contact/contact.controller';
import { Contact } from '@plugins/crm/contact/entities/contact.entity';
import { ContactService } from '@plugins/crm/contact/services/contact.service';
import { Customer } from '@plugins/crm/customer/entities/customer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Contact, Customer])],
  controllers: [ContactController],
  providers: [ContactService],
  exports: [ContactService],
})
export class ContactModule {}
