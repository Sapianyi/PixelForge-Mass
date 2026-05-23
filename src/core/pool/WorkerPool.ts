// src/core/pool/WorkerPool.ts

export interface PipelineTask {
  id: string;
  fileHandle: FileSystemFileHandle;
  fileName: string;
  size: number;
  transformOptions: {
    format: string;
    quality: number;
    scaleMode: string;
    targetW: number;
    targetH: number;
    scaleAlgo: string;
    cleanMeta: boolean;
  };
}

export class WorkerPool {
  private taskQueue: PipelineTask[] = [];
  private activeWorkersCount = 0;
  private currentBytesProcessing = 0;
  private activeWorkers: Map<string, Worker> = new Map();

  private readonly MAX_CONCURRENT_WORKERS = navigator.hardwareConcurrency || 4;
  private readonly MAX_BYTES_IN_FLIGHT = 200 * 1024 * 1024;

  // ✅ ФІКС: Колбек тепер приймає згенеровані бінарні дані з воркера
  private onTaskCompleteCallback:
    | ((
        taskId: string,
        totalProcessed: number,
        buffer?: ArrayBuffer,
        format?: string,
      ) => void)
    | null = null;
  private onTaskErrorCallback: ((taskId: string, error: any) => void) | null =
    null;
  private onQueueEmptyCallback: (() => void) | null = null;

  private totalQueuedTasksCount = 0;
  private processedTasksCount = 0;

  constructor() {}

  public setupListeners(
    onTaskComplete: (
      taskId: string,
      totalProcessed: number,
      buffer?: ArrayBuffer,
      format?: string,
    ) => void,
    onTaskError: (taskId: string, error: any) => void,
    onQueueEmpty: () => void,
  ) {
    this.onTaskCompleteCallback = onTaskComplete;
    this.onTaskErrorCallback = onTaskError;
    this.onQueueEmptyCallback = onQueueEmpty;
  }

  public async addTask(
    task: PipelineTask,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) return;

    signal?.addEventListener("abort", () => {
      const index = this.taskQueue.findIndex((t) => t.id === task.id);
      if (index !== -1) this.taskQueue.splice(index, 1);
    });

    this.taskQueue.push(task);
    this.totalQueuedTasksCount++;
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.taskQueue.length === 0 && this.activeWorkersCount === 0) {
      if (this.onQueueEmptyCallback) this.onQueueEmptyCallback();
      this.resetCounters();
      return;
    }

    while (
      this.activeWorkersCount < this.MAX_CONCURRENT_WORKERS &&
      this.taskQueue.length > 0 &&
      this.currentBytesProcessing + this.taskQueue[0].size <=
        this.MAX_BYTES_IN_FLIGHT
    ) {
      const task = this.taskQueue.shift()!;
      this.activeWorkersCount++;
      this.currentBytesProcessing += task.size;

      this.executeTask(task);
    }
  }

  private async executeTask(task: PipelineTask): Promise<void> {
    try {
      const worker = new Worker(
        new URL("../workers/scale.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.activeWorkers.set(task.id, worker);

      // Очікуємо результат від воркера
      const workerResult = await new Promise<{
        arrayBuffer: ArrayBuffer;
        format: string;
      }>((resolve, reject) => {
        worker.onmessage = (e) => {
          if (e.data.error) {
            reject(new Error(e.data.error));
          } else if (e.data.success) {
            resolve({ arrayBuffer: e.data.arrayBuffer, format: e.data.format });
          }
        };
        worker.onerror = (err) => reject(err);

        worker.postMessage({
          id: task.id,
          fileHandle: task.fileHandle,
          options: task.transformOptions,
        });
      });

      // Передаємо байти далі в main.ts для безпечного збереження на диск
      this.handleTaskSuccess(
        task.id,
        task.size,
        workerResult.arrayBuffer,
        workerResult.format,
      );
    } catch (error) {
      this.handleTaskError(task.id, task.size, error);
    } finally {
      if (this.activeWorkers.has(task.id)) {
        this.activeWorkers.get(task.id)?.terminate();
        this.activeWorkers.delete(task.id);
      }
    }
  }

  private handleTaskSuccess(
    taskId: string,
    taskSize: number,
    buffer: ArrayBuffer,
    format: string,
  ): void {
    this.activeWorkersCount--;
    this.currentBytesProcessing -= taskSize;
    this.processedTasksCount++;

    if (this.onTaskCompleteCallback) {
      this.onTaskCompleteCallback(
        taskId,
        this.processedTasksCount,
        buffer,
        format,
      );
    }

    this.processNext();
  }

  private handleTaskError(taskId: string, taskSize: number, error: any): void {
    console.error(`[WorkerPool] Failure on task ${taskId}:`, error);
    this.activeWorkersCount--;
    this.currentBytesProcessing -= taskSize;
    this.processedTasksCount++;

    if (this.onTaskErrorCallback) {
      this.onTaskErrorCallback(taskId, error);
    }

    this.processNext();
  }

  public terminateAll(): void {
    this.taskQueue = [];
    for (const [taskId, worker] of this.activeWorkers.entries()) {
      worker.terminate();
    }
    this.activeWorkers.clear();
    this.resetCounters();
  }

  private resetCounters(): void {
    this.activeWorkersCount = 0;
    this.currentBytesProcessing = 0;
    this.totalQueuedTasksCount = 0;
    this.processedTasksCount = 0;
  }
}
