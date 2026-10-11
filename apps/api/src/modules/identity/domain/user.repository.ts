import type { User } from './user';

/** Porta de persistência de usuários. */
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findByGoogleId(googleId: string): Promise<User | null>;
  abstract countActiveAdmins(): Promise<number>;
  abstract save(user: User): Promise<void>;
}
