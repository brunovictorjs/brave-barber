import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AggregateRoot, DomainEvent } from '@/shared/domain/aggregate-root';

/**
 * Publica os eventos de domínio depois que o agregado foi salvo. Os módulos
 * interessados (notificações, comissões) assinam com @OnEvent(nome).
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);

  constructor(private readonly emitter: EventEmitter2) {}

  async publish(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      try {
        await this.emitter.emitAsync(event.name, event);
      } catch (error) {
        // Um assinante com problema não pode desfazer a operação que já foi salva.
        this.logger.error(`Falha ao tratar ${event.name}: ${(error as Error).message}`, (error as Error).stack);
      }
    }
  }

  async publishFrom(aggregate: AggregateRoot): Promise<void> {
    await this.publish(aggregate.pullEvents());
  }
}
