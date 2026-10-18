import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DomainError } from '@/shared/domain/domain-error';
import { Clock } from '@/shared/infrastructure/clock';
import { FileStorage, UploadedFile } from '@/shared/infrastructure/storage/storage';
import { UserRepository } from '../domain/user.repository';

export const identityInput = z.object({
  firstName: z.string().trim().min(2, 'Informe seu nome'),
  lastName: z.string().trim().default(''),
  phone: z.string().trim().nullable().default(null),
});

export const aboutInput = z.object({
  about: z.string().max(400, 'Até 400 caracteres').nullable().default(null),
  finish: z.boolean().default(false),
});

/** "Monte seu perfil": identidade, sobre mim e foto. */
@Injectable()
export class ProfileService {
  constructor(
    private readonly users: UserRepository,
    private readonly storage: FileStorage,
    private readonly clock: Clock,
  ) {}

  private async user(id: string) {
    const user = await this.users.findById(id);
    if (!user) throw DomainError.notFound('Usuário');
    return user;
  }

  async updateIdentity(userId: string, input: z.infer<typeof identityInput>) {
    const user = await this.user(userId);
    user.updateIdentity(input);
    await this.users.save(user);
  }

  async updateAbout(userId: string, input: z.infer<typeof aboutInput>) {
    const user = await this.user(userId);
    user.updateAbout(input);
    if (input.finish) user.completeOnboarding(this.clock.now());
    await this.users.save(user);
  }

  async finishOnboarding(userId: string) {
    const user = await this.user(userId);
    user.completeOnboarding(this.clock.now());
    await this.users.save(user);
  }

  async uploadAvatar(userId: string, file: UploadedFile) {
    if (!file.mimetype.startsWith('image/')) throw new DomainError('invalid_file', 'Envie uma imagem.');
    const user = await this.user(userId);
    const url = await this.storage.save('avatars', file);
    user.setAvatar(url);
    await this.users.save(user);
    return { url };
  }
}
