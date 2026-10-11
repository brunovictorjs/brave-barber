import { Module } from '@nestjs/common';
import { BusinessModule } from '@/modules/business/business.module';
import { AuthService } from './application/auth.service';
import { ProfileService } from './application/profile.service';
import { UsersAdminService } from './application/users-admin.service';
import { UserRepository } from './domain/user.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { AuthController, ProfileController, UsersAdminController } from './presentation/identity.controllers';

/** Identidade: login, sessão, perfil e papéis. */
@Module({
  imports: [BusinessModule],
  controllers: [AuthController, ProfileController, UsersAdminController],
  providers: [AuthService, ProfileService, UsersAdminService, { provide: UserRepository, useClass: PrismaUserRepository }],
  exports: [UserRepository],
})
export class IdentityModule {}
