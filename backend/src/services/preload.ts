import type { Card, PreloadProgress } from "@cso/shared";
import type { FastifyBaseLogger } from "fastify";
import type { EventHub } from "./events.ts";
import type { ImageCache } from "./images.ts";

const CONCURRENCY = 4;

interface Job {
  deckId: number;
  cards: Card[];
  progress: PreloadProgress;
  cancelled: boolean;
}

export class PreloadQueue {
  private readonly images: ImageCache;
  private readonly events: EventHub;
  private readonly log: FastifyBaseLogger;
  private readonly jobs = new Map<number, Job>();

  constructor(images: ImageCache, events: EventHub, log: FastifyBaseLogger) {
    this.images = images;
    this.events = events;
    this.log = log;
  }

  status(): PreloadProgress[] {
    return [...this.jobs.values()].map((job) => job.progress);
  }

  start(deckId: number, cards: Card[]): PreloadProgress {
    const current = this.jobs.get(deckId);
    if (current?.progress.running) current.cancelled = true;

    const unique = [...new Map(cards.map((card) => [card.key, card])).values()];
    const tasks = unique.flatMap((card) => card.faces.map((_, faceIndex) => ({ card, faceIndex })));
    const job: Job = {
      deckId,
      cards: unique,
      cancelled: false,
      progress: { deckId, total: tasks.length, done: 0, failed: 0, running: true },
    };
    this.jobs.set(deckId, job);
    this.publish(job);
    void this.run(job, tasks);
    return job.progress;
  }

  cancel(deckId: number): void {
    const job = this.jobs.get(deckId);
    if (job) job.cancelled = true;
  }

  private async run(job: Job, tasks: { card: Card; faceIndex: number }[]): Promise<void> {
    let index = 0;
    const worker = async (): Promise<void> => {
      while (!job.cancelled && index < tasks.length) {
        const task = tasks[index++]!;
        try {
          await this.images.ensure(task.card, task.faceIndex);
          job.progress.done++;
        } catch (error) {
          job.progress.failed++;
          this.log.warn({ card: task.card.key, err: String(error) }, "image download failed");
        }
        this.publish(job);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    job.progress.running = false;
    this.publish(job);
  }

  private publish(job: Job): void {
    this.events.control.publish({ type: "preload", progress: { ...job.progress } });
  }
}
