import { Controller, Get, Module, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '@/shared/presentation/auth';
import { ZodPipe } from '@/shared/presentation/zod';
import { BusinessModule } from '@/modules/business/business.module';
import { reportQuery, ReportQuery, ReportsService } from './reports.service';

@Controller('admin/reports')
@Roles('ADMIN')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  overview(@Query(new ZodPipe(reportQuery)) q: ReportQuery) {
    return this.reports.overview(q);
  }

  @Get('sales')
  sales(@Query(new ZodPipe(reportQuery)) q: ReportQuery) {
    return this.reports.sales(q);
  }

  @Get('sales.csv')
  async salesCsv(@Query(new ZodPipe(reportQuery)) q: ReportQuery, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vendas-brave-barber.csv"');
    res.send(await this.reports.salesCsv(q));
  }
}

/** Relatórios: visão geral e vendas (só administrador). */
@Module({
  imports: [BusinessModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportingModule {}
