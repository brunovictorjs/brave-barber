export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
}

/**
 * Raiz de agregado: guarda os eventos de domínio gerados por uma operação até
 * o repositório persistir o agregado; depois a aplicação os publica.
 */
export abstract class AggregateRoot<TId = string> {
  private pendingEvents: DomainEvent[] = [];

  protected constructor(readonly id: TId) {}

  protected record(event: DomainEvent): void {
    this.pendingEvents.push(event);
  }

  pullEvents(): DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }
}
