import { Injectable } from '@nestjs/common';

/** Relógio injetável — os testes trocam por um relógio fixo. */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
