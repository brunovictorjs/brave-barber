import { Module } from '@nestjs/common';
import { BusinessModule } from '@/modules/business/business.module';
import { CommissionQueries } from './application/commission.queries';
import { CommissionService } from './application/commission.service';
import { AdminCommissionsController, EarningsController } from './presentation/commissions.controller';

/** Comissões: cálculo na conclusão, ganhos do barbeiro e repasses. */
@Module({
  imports: [BusinessModule],
  controllers: [EarningsController, AdminCommissionsController],
  providers: [CommissionService, CommissionQueries],
  exports: [CommissionService],
})
export class CommissionsModule {}
