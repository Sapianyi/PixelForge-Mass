// src/core/StreamingPipeline.ts

export class StreamingPipeline {
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  private activeDirectory: FileSystemDirectoryHandle | null = null;
  private readonly DIR_NAME = "pixelforge_stream_buffer";

  constructor() {}

  /**
   * Точка старту: Отримуємо доступ до локального дискового простору OPFS
   */
  public async init(): Promise<void> {
    try {
      this.opfsRoot = await navigator.storage.getDirectory();
      this.activeDirectory = await this.opfsRoot.getDirectoryHandle(
        this.DIR_NAME,
        { create: true },
      );
      await this.clearBuffer(); // Гарантоване очищення від залишків минулих запусків
    } catch (error) {
      console.error(
        "[StreamingPipeline] Failed to map OPFS storage handles:",
        error,
      );
      throw new Error("Origin Private File System allocation failed.");
    }
  }

  /**
   * Записує вхідний файл користувача прямо на SSD/HDD у бінарному потоці (Streaming)
   * @param file Оригінальний файл із черги інпуту
   * @param taskId Унікальний ідентифікатор задачі (наприклад, UUID або індекс)
   */
  public async streamToDisk(
    file: File,
    taskId: string,
  ): Promise<FileSystemFileHandle> {
    if (!this.activeDirectory)
      throw new Error("Pipeline storage is not initialized.");

    // Створюємо пустий дескриптор файлу в пісочниці диска
    const fileHandle = await this.activeDirectory.getFileHandle(
      `${taskId}.raw`,
      { create: true },
    );

    // Створюємо асинхронний потік для запису на диск
    const writableStream = await fileHandle.createWritable();

    // Перенаправляємо стрім файлу безпосередньо в OPFS (RAM залишається вільною)
    await file.stream().pipeTo(writableStream);

    return fileHandle;
  }

  /**
   * Записує вже оброблений масив байтів з воркера назад на диск під правильним розширенням
   */
  public async writeProcessedToDisk(
    taskId: string,
    ext: string,
    buffer: ArrayBuffer,
  ): Promise<void> {
    if (!this.activeDirectory)
      throw new Error("Pipeline storage is not initialized.");
    const fileHandle = await this.activeDirectory.getFileHandle(
      `${taskId}.${ext}`,
      { create: true },
    );
    const writableStream = await fileHandle.createWritable();
    await writableStream.write(buffer);
    await writableStream.close();
  }

  /**
   * ✅ ВИПРАВЛЕНО: Повертаємо прямий дескриптор файлу на диску замість вивантаження в RAM.
   * Це дозволяє воркерам самостійно відкривати та читати файл шматками.
   */
  public async getFileHandleFromDisk(
    taskId: string,
    extension: string,
  ): Promise<FileSystemFileHandle> {
    if (!this.activeDirectory)
      throw new Error("Pipeline storage is not initialized.");
    return await this.activeDirectory.getFileHandle(`${taskId}.${extension}`);
  }

  /**
   * ✅ ВИПРАВЛЕНО: Потокове читання з диска через ReadableStream без забивання пам'яті.
   * Використовується для фінального пакування файлів у ZIP-архів безпосередньо.
   */
  public async readStreamFromDisk(
    taskId: string,
    extension: string = "raw",
  ): Promise<ReadableStream<Uint8Array>> {
    if (!this.activeDirectory)
      throw new Error("Pipeline storage is not initialized.");
    const fileHandle = await this.activeDirectory.getFileHandle(
      `${taskId}.${extension}`,
    );
    const file = await fileHandle.getFile();
    return file.stream() as ReadableStream<Uint8Array>;
  }

  /**
   * Видаляє конкретний файл з диска після того, як він був оброблений і заархівований
   */
  public async deleteFileFromDisk(
    taskId: string,
    extension: string = "raw",
  ): Promise<void> {
    if (!this.activeDirectory) return;
    try {
      await this.activeDirectory.removeEntry(`${taskId}.${extension}`);
    } catch (e) {
      console.warn(
        `[StreamingPipeline] Could not clear file ${taskId}.${extension}:`,
        e,
      );
    }
  }

  /**
   * Капітальне очищення буфера (захист від витоку дискового простору)
   */
  public async clearBuffer(): Promise<void> {
    if (!this.opfsRoot) return;
    try {
      // Жорстко видаляємо всю папку разом із вмістом
      await this.opfsRoot.removeEntry(this.DIR_NAME, { recursive: true });
      // Перестворюємо пусту папку під нові задачі
      this.activeDirectory = await this.opfsRoot.getDirectoryHandle(
        this.DIR_NAME,
        { create: true },
      );
      console.log(
        "[StreamingPipeline] Local OPFS streaming storage buffer completely cleared.",
      );
    } catch (error) {
      // Якщо папки не існувало — це нормальний стан для першого запуску
      console.log(
        "[StreamingPipeline] Storage buffer ready (fresh allocation).",
      );
    }
  }
}
