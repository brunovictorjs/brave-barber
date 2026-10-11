import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { AppConfig } from '@/config/app-config.service';
import { DomainError } from '@/shared/domain/domain-error';
import { newId } from '@/shared/domain/text';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
const MAX_BYTES = 25 * 1024 * 1024;

/** Porta de armazenamento de arquivos (fotos e vídeos do catálogo). */
export abstract class FileStorage {
  abstract save(folder: string, file: UploadedFile): Promise<string>;

  protected check(file: UploadedFile): void {
    if (!ALLOWED.includes(file.mimetype)) {
      throw new DomainError('invalid_file', 'Envie imagens JPG, PNG, WEBP ou GIF, ou vídeos MP4/WEBM.');
    }
    if (file.size > MAX_BYTES) throw new DomainError('file_too_large', 'O arquivo passa de 25 MB.');
  }

  protected fileName(file: UploadedFile): string {
    return `${newId()}${extname(file.originalname).toLowerCase() || '.bin'}`;
  }
}

/** Desenvolvimento: grava em apps/api/uploads e serve em /uploads. */
@Injectable()
export class LocalFileStorage extends FileStorage {
  private readonly root = join(process.cwd(), 'uploads');

  async save(folder: string, file: UploadedFile): Promise<string> {
    this.check(file);
    const dir = join(this.root, folder);
    await mkdir(dir, { recursive: true });
    const name = this.fileName(file);
    await writeFile(join(dir, name), file.buffer);
    return `/uploads/${folder}/${name}`;
  }
}

/** Produção: Supabase Storage (bucket público definido em SUPABASE_STORAGE_BUCKET). */
@Injectable()
export class SupabaseFileStorage extends FileStorage {
  private readonly logger = new Logger(SupabaseFileStorage.name);
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(config: AppConfig) {
    super();
    this.client = createClient(config.get('SUPABASE_URL'), config.get('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
    this.bucket = config.get('SUPABASE_STORAGE_BUCKET');
  }

  async save(folder: string, file: UploadedFile): Promise<string> {
    this.check(file);
    const path = `${folder}/${this.fileName(file)}`;
    const { error } = await this.client.storage.from(this.bucket).upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    if (error) {
      this.logger.error(error.message);
      throw new DomainError('upload_failed', 'Não foi possível enviar o arquivo agora.');
    }
    return this.client.storage.from(this.bucket).getPublicUrl(path).data.publicUrl;
  }
}

export const fileStorageProvider = {
  provide: FileStorage,
  inject: [AppConfig],
  useFactory: (config: AppConfig): FileStorage =>
    config.get('STORAGE_DRIVER') === 'supabase' ? new SupabaseFileStorage(config) : new LocalFileStorage(),
};
