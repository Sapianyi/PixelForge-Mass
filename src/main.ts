// src/main.ts
import { StreamingPipeline } from "./core/StreamingPipeline";
import { WorkerPool, PipelineTask } from "./core/pool/WorkerPool";
import { Zip } from "fflate";

// --- ЕЛЕМЕНТИ ІНТЕРФЕЙСУ УПРАВЛІННЯ ---
const scaleModeSelect = document.getElementById(
  "scale-mode",
) as HTMLSelectElement;
const targetWInput = document.getElementById("target-w") as HTMLInputElement;
const targetHInput = document.getElementById("target-h") as HTMLInputElement;
const scaleAlgoSelect = document.getElementById(
  "scale-algo",
) as HTMLSelectElement;

const exportFormatSelect = document.getElementById(
  "export-format",
) as HTMLSelectElement;
const qualitySlider = document.getElementById(
  "webp-quality",
) as HTMLInputElement;
const qualityValueDisplay = document.getElementById(
  "quality-value",
) as HTMLSpanElement;
const qualityLabel = document.querySelector(
  "#quality-field-group label",
) as HTMLLabelElement;

const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const cancelBtn = document.getElementById("cancel-btn") as HTMLButtonElement;
const browserCheckSpan = document.getElementById(
  "browser-check",
) as HTMLSpanElement;
const consoleLogZone = document.getElementById("console-log") as HTMLDivElement;

const dropzoneArea = document.getElementById("dropzone") as HTMLDivElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const fileListZone = document.getElementById("file-list") as HTMLDivElement;
const namingPatternInput = document.getElementById(
  "naming-pattern",
) as HTMLInputElement;

const progressContainer = document.getElementById(
  "progress-container",
) as HTMLDivElement;
const progressBar = document.getElementById("progress-bar") as HTMLDivElement;
const progressText = document.getElementById(
  "progress-text",
) as HTMLSpanElement;

// --- ІНІЦІАЛІЗАЦІЯ СИСТЕМНИХ КЛАСІВ ---
const MAX_FILES = 500;
const MAX_FILE_SIZE_MB = 20;
let isSystemReady = false;
let isPipelineRunning = false;
let abortController: AbortController | null = null;

// Наш головний синхронізатор імен між OPFS, воркером та архіватором
let sessionTaskIds: string[] = [];

const pipeline = new StreamingPipeline();
const pool = new WorkerPool();

function logToConsole(message: string): void {
  if (consoleLogZone) {
    const timestamp = new Date().toLocaleTimeString();
    consoleLogZone.innerHTML += `<br />[${timestamp}] ${message}`;
    consoleLogZone.scrollTop = consoleLogZone.scrollHeight;
  }
  console.log(message);
}

// --- ПЕРЕВІРКА МОЖЛИВОСТЕЙ БРАУЗЕРА ТА ЗАПУСК OPFS ---
async function initEngine(): Promise<void> {
  const hasOPFS =
    "storage" in navigator &&
    typeof navigator.storage.getDirectory === "function";
  const hasWorkers = typeof window.Worker !== "undefined";
  const hardwareCores = navigator.hardwareConcurrency || 2;

  if (hasOPFS && hasWorkers) {
    try {
      await pipeline.init();
      browserCheckSpan.innerHTML = `✅ OPFS Sandbox & WorkerPool Ready (${hardwareCores} Hardware Cores Detected)`;
      browserCheckSpan.style.color = "#39ff14";
      isSystemReady = true;
      logToConsole("[System] Engine initialized successfully.");
    } catch (e) {
      browserCheckSpan.innerHTML = `⚠️ Storage Initialization Failed`;
      browserCheckSpan.style.color = "#ff007f";
      logToConsole(`[Error] Storage init failed: ${e}`);
    }
  } else {
    browserCheckSpan.innerHTML = `⚠️ Critical Engine Failure: Browser missing modern API requirements.`;
    browserCheckSpan.style.color = "#ff007f";
    logToConsole("[Error] Browser does not support OPFS or Web Workers.");
  }
}

// --- СЛУХАЧІ ПРОГРЕСУ WORKER POOL ---
pool.setupListeners(
  // ✅ ФІКС: Більше немає зміщення індексів. taskId використовується прямо для адресації пам'яті
  async (taskId, totalProcessed, buffer, format) => {
    const totalFiles = fileInput.files?.length || 0;
    const percentage = Math.round((totalProcessed / totalFiles) * 100);
    progressBar.style.width = `${percentage}%`;
    progressText.innerText = `${totalProcessed} / ${totalFiles} files (${percentage}%)`;

    if (buffer && format) {
      try {
        await pipeline.writeProcessedToDisk(taskId, format, buffer);
        logToConsole(
          `[Pipeline] Asset [${taskId}] successfully written to OPFS sandbox disk.`,
        );
      } catch (err) {
        logToConsole(`[Error] Failed to save compiled bytes to OPFS: ${err}`);
      }
    }
  },
  (taskId, error) => {
    logToConsole(
      `<span style="color: #ff007f;">[Error] Task ${taskId} failed: ${error.message}</span>`,
    );
  },
  async () => {
    logToConsole(`[System] All files processed. Creating ZIP archive...`);
    await compileFinalZip();
  },
);

// --- ЗБІРКА ZIP ---
async function compileFinalZip(): Promise<void> {
  const files = fileInput.files;
  if (!files || files.length === 0) {
    logToConsole(`[Error] No files in fileInput`);
    resetUI();
    return;
  }

  try {
    const format = exportFormatSelect.value;
    const mask = namingPatternInput?.value || "asset_#";

    logToConsole(`[Archiver] Allocating binary builders via fflate...`);

    const { Zip, ZipDeflate } = await import("fflate");
    const zipChunks: Uint8Array[] = [];

    const zipArchive = new Zip((err, chunk, final) => {
      if (err) {
        logToConsole(`[Error] ZIP compression engine crashed: ${err.message}`);
        return;
      }
      if (chunk && chunk.length > 0) {
        zipChunks.push(chunk.slice());
      }

      if (final) {
        logToConsole(`[Archiver] Compiling continuous Blob package...`);

        if (zipChunks.length === 0) {
          logToConsole(
            `<span style="color: #ff007f;">[Error] Buffer package compilation collapsed.</span>`,
          );
          resetUI();
          return;
        }

        const finalBlob = new Blob(zipChunks as BlobPart[], {
          type: "application/zip",
        });
        const url = URL.createObjectURL(finalBlob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `pixelforge_batch_${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        logToConsole(
          `✅ <span style="color: #39ff14;">Archive successfully created! Total size: ${(finalBlob.size / 1024 / 1024).toFixed(2)} MB</span>`,
        );

        pipeline.clearBuffer().catch(() => {});
        resetUI();
      }
    });

    let filesFound = 0;

    for (let i = 0; i < sessionTaskIds.length; i++) {
      const taskId = sessionTaskIds[i];
      if (!taskId) continue;

      const extensionsToTry = [format, "webp", "qoi", "avif"];
      let assetPacked = false;

      for (const ext of extensionsToTry) {
        try {
          const fileHandle = await pipeline.getFileHandleFromDisk(taskId, ext);
          const fileData = await fileHandle.getFile();
          const arrayBuffer = await fileData.arrayBuffer();

          if (arrayBuffer.byteLength > 0) {
            const outputName =
              mask.replace("#", (i + 1).toString()) + `.${ext}`;

            const zipFile = new ZipDeflate(outputName);
            zipArchive.add(zipFile);
            zipFile.push(new Uint8Array(arrayBuffer), true);

            logToConsole(
              `[Archiver] Added to package: ${outputName} (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)`,
            );

            await pipeline.deleteFileFromDisk(taskId, ext).catch(() => {});
            filesFound++;
            assetPacked = true;
            break;
          }
        } catch (e) {
          // Шукаємо файл далі
        }
      }

      if (!assetPacked) {
        logToConsole(
          `<span style="color: #ffb86c;">[Warning] Не вдалося локалізувати оброблений файл для ID ${taskId} в OPFS.</span>`,
        );
      }

      await pipeline.deleteFileFromDisk(taskId, "raw").catch(() => {});
    }

    zipArchive.end();

    if (filesFound === 0) {
      logToConsole(
        `<span style="color: #ff007f;">[Error] Жодного обробленого файлу не знайдено в OPFS.</span>`,
      );
      resetUI();
      return;
    }
  } catch (error) {
    logToConsole(`[Archiver] Failed: ${(error as Error).message}`);
    resetUI();
  }
}

// --- ЗАПУСК ОБРОБКИ ---
startBtn.addEventListener("click", async () => {
  if (isPipelineRunning) {
    logToConsole("[System] Pipeline already running.");
    return;
  }

  const files = fileInput.files;
  if (!files || files.length === 0 || !isSystemReady) return;

  isPipelineRunning = true;
  abortController = new AbortController();
  startBtn.disabled = true;
  cancelBtn.disabled = false;
  dropzoneArea.style.pointerEvents = "none";

  const totalFiles = files.length;
  progressContainer.style.display = "block";
  progressBar.style.width = "0%";
  progressText.innerText = `0 / ${totalFiles} files`;

  sessionTaskIds = [];

  logToConsole(`[System] Processing ${totalFiles} files...`);

  try {
    for (let i = 0; i < totalFiles; i++) {
      if (abortController.signal.aborted) return;

      const file = files[i];
      const taskId = `${Date.now()}_${i}_${crypto.randomUUID()}`;
      sessionTaskIds.push(taskId);

      const diskHandle = await pipeline.streamToDisk(file, taskId);

      const task: PipelineTask = {
        id: taskId,
        fileHandle: diskHandle,
        fileName: file.name,
        size: file.size,
        transformOptions: {
          format: exportFormatSelect.value,
          quality: parseInt(qualitySlider.value, 10),
          scaleMode: scaleModeSelect.value,
          targetW: parseInt(targetWInput.value, 10) || 0,
          targetH: parseInt(targetHInput.value, 10) || 0,
          scaleAlgo: scaleAlgoSelect.value,
          cleanMeta: (document.getElementById("clean-meta") as HTMLInputElement)
            .checked,
        },
      };

      await pool.addTask(task, abortController.signal);
    }
  } catch (err) {
    logToConsole(`[Pipeline] Failed: ${(err as Error).message}`);
    resetUI();
  }
});

// --- КНОПКА CANCEL ---
cancelBtn.addEventListener("click", async () => {
  if (abortController) {
    abortController.abort();
    pool.terminateAll();
    try {
      await pipeline.clearBuffer();
    } catch (e) {
      logToConsole(`[Cancel] Buffer clear error: ${e}`);
    }
    logToConsole("[System] Operation cancelled.");
    resetUI();
  }
});

function resetUI(): void {
  fileInput.value = "";
  fileListZone.innerHTML = "";
  fileListZone.style.display = "none";
  startBtn.disabled = true;
  cancelBtn.disabled = true;
  dropzoneArea.style.pointerEvents = "auto";
  progressContainer.style.display = "none";
  abortController = null;
  isPipelineRunning = false;
  sessionTaskIds = [];
}

// --- UI СЛУХАЧІ РЕАКТИВНОСТІ ---
scaleModeSelect.addEventListener("change", () => {
  const isResizeRequired = scaleModeSelect.value !== "none";
  targetWInput.disabled = !isResizeRequired;
  targetHInput.disabled = !isResizeRequired;
  scaleAlgoSelect.disabled = !isResizeRequired;
  if (!isResizeRequired) {
    targetWInput.value = "";
    targetHInput.value = "";
  }
});

exportFormatSelect.addEventListener("change", () => {
  const currentFormat = exportFormatSelect.value;
  if (currentFormat === "qoi") {
    qualitySlider.disabled = true;
    qualityValueDisplay.innerText = "LOSSLESS";
    qualityLabel.innerText = "QOI Matrix Status";
  } else {
    qualitySlider.disabled = false;
    qualityValueDisplay.innerText = qualitySlider.value;
    qualityLabel.innerText =
      currentFormat === "webp"
        ? "WebP Compression Quality"
        : "AVIF Container Quality";
  }
});

qualitySlider.addEventListener("input", () => {
  qualityValueDisplay.innerText = qualitySlider.value;
});

function handleFilesSelection(files: FileList | null): void {
  if (!files) return;
  const filesCount = files.length;
  fileListZone.innerHTML = "";
  fileListZone.style.display = "none";

  if (filesCount > MAX_FILES) {
    logToConsole(`[Error] Too many files: ${filesCount} > ${MAX_FILES}`);
    startBtn.disabled = true;
    fileInput.value = "";
    return;
  }

  for (let i = 0; i < filesCount; i++) {
    const file = files[i];
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      logToConsole(`[Error] ${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit`);
      startBtn.disabled = true;
      fileInput.value = "";
      return;
    }
  }

  if (filesCount > 0) {
    fileListZone.style.display = "block";
    logToConsole(`📁 Loaded ${filesCount} file(s)`);

    for (let i = 0; i < filesCount; i++) {
      const file = files[i];
      fileListZone.innerHTML += `<div>📄 [${i + 1}] ${file.name} (${(file.size / 1024).toFixed(1)} KB)</div>`;
    }
    if (isSystemReady) startBtn.disabled = false;
  }
}

// --- КОРЕКТНА ЛОГІКА DRAG & DROP ---
window.addEventListener("dragover", (e) => e.preventDefault(), false);
window.addEventListener("drop", (e) => e.preventDefault(), false);

if (dropzoneArea) {
  dropzoneArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneArea.classList.add("drag-over");
  });

  dropzoneArea.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneArea.classList.remove("drag-over");
  });

  dropzoneArea.addEventListener("drop", async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneArea.classList.remove("drag-over");

    const items = e.dataTransfer?.items;
    if (!items) return;

    logToConsole(`[System] Drop зафіксовано. Обробка структури...`);
    const fileList: File[] = [];

    async function traverseDirectory(entry: any): Promise<void> {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) =>
          entry.file(resolve, reject),
        );
        const fileNameLower = file.name.toLowerCase();

        const isSystemTrash =
          fileNameLower === "thumbs.db" ||
          fileNameLower === ".ds_store" ||
          fileNameLower.startsWith("._") ||
          file.size === 0;

        const hasValidExtension =
          fileNameLower.endsWith(".png") ||
          fileNameLower.endsWith(".jpg") ||
          fileNameLower.endsWith(".jpeg") ||
          fileNameLower.endsWith(".webp") ||
          fileNameLower.endsWith(".bmp") ||
          fileNameLower.endsWith(".svg");

        if (!isSystemTrash && hasValidExtension) {
          fileList.push(file);
        }
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const entries = await new Promise<any[]>((resolve, reject) =>
          dirReader.readEntries(resolve, reject),
        );
        for (const innerEntry of entries) {
          await traverseDirectory(innerEntry);
        }
      }
    }

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const entry = item.webkitGetAsEntry();
          if (entry) await traverseDirectory(entry);
        }
      }

      if (fileList.length > 0) {
        const dataTransfer = new DataTransfer();
        fileList.forEach((file) => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;
        handleFilesSelection(fileInput.files);
      } else {
        logToConsole(
          `<span style="color: #ffb86c;">[Warning] Графічних файлів або папок у виділенні не знайдено.</span>`,
        );
      }
    } catch (err) {
      logToConsole(
        `<span style="color: #ff007f;">[Error] Помилка обходу папок: ${(err as Error).message}</span>`,
      );
    }
  });

  dropzoneArea.addEventListener("click", () => {
    fileInput.click();
  });
}

const copyLogBtn = document.getElementById("copy-log-btn") as HTMLButtonElement;

if (copyLogBtn) {
  copyLogBtn.addEventListener("click", () => {
    const logZone = document.getElementById("console-log") as HTMLDivElement;
    if (!logZone) return;

    // Очищаємо HTML-теги (<br>, <span style...>), щоб скопіювати чистий текст для терміналу
    const plainText = logZone.innerText || logZone.textContent || "";

    navigator.clipboard
      .writeText(plainText)
      .then(() => {
        const originalText = copyLogBtn.innerText;
        copyLogBtn.innerText = "✅ Log Copied!";
        copyLogBtn.style.borderColor = "#39ff14";
        copyLogBtn.style.color = "#39ff14";

        setTimeout(() => {
          copyLogBtn.innerText = originalText;
          copyLogBtn.style.borderColor = "#00f0ff";
          copyLogBtn.style.color = "#00f0ff";
        }, 1500);
      })
      .catch((err) => {
        logToConsole(`[System Error] Failed to copy log: ${err}`);
      });
  });
}

// ЗАПУСК
initEngine();
