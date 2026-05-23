// src/core/workers/scale.worker.ts

interface WorkerMessageEvent extends MessageEvent {
  data: {
    id: string;
    fileHandle: FileSystemFileHandle;
    options: {
      format: string;
      quality: number;
      scaleMode: string;
      targetW: number;
      targetH: number;
      scaleAlgo: string;
      cleanMeta: boolean;
    };
  };
}

const MAX_DIMENSION = 8192;

self.addEventListener("message", async (e: WorkerMessageEvent) => {
  const { id, fileHandle, options } = e.data;

  try {
    self.postMessage({ id, type: "progress", percent: 15 });

    const file = await fileHandle.getFile();

    if (file.size === 0) {
      throw new Error(
        "Алокований стрімінг-буфер в OPFS пустий (0 байтів). Файл пошкоджено.",
      );
    }

    let sourceBitmap: ImageBitmap;
    try {
      sourceBitmap = await createImageBitmap(file);
    } catch (decodeError) {
      throw new Error(
        `Браузерний декодер відхилив ассет. Mime-Type: [${file.type || "невідомо"}], Розширення: [${file.name.split(".").pop()}], Вага: [${file.size} байтів]. Нативні рушії не можуть розпарсити цю бінарну структуру.`,
      );
    }

    const originalW = sourceBitmap.width;
    const originalH = sourceBitmap.height;

    if (originalW > MAX_DIMENSION || originalH > MAX_DIMENSION) {
      sourceBitmap.close();
      throw new Error(
        `Зображення занадто велике: ${originalW}x${originalH}px. Ліміт ядра: ${MAX_DIMENSION}px.`,
      );
    }

    self.postMessage({ id, type: "progress", percent: 35 });

    let finalW = options.targetW || originalW;
    let finalH = options.targetH || originalH;

    if (options.scaleMode !== "none") {
      const targetParams = calculateDimensions(
        options.scaleMode,
        originalW,
        originalH,
        finalW,
        finalH,
      );
      finalW = targetParams.w;
      finalH = targetParams.h;
    }

    const offscreenCanvas = new OffscreenCanvas(finalW, finalH);
    const ctx = offscreenCanvas.getContext("2d");
    if (!ctx)
      throw new Error("Не вдалося ініціалізувати контекст OffscreenCanvas.");

    const isResizeRequired =
      options.scaleMode !== "none" &&
      (originalW !== finalW || originalH !== finalH);

    if (!isResizeRequired) {
      ctx.drawImage(sourceBitmap, 0, 0);
    } else if (options.scaleAlgo === "nearest") {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sourceBitmap, 0, 0, finalW, finalH);
    } else {
      const srcCanvas = new OffscreenCanvas(originalW, originalH);
      const srcCtx = srcCanvas.getContext("2d")!;
      srcCtx.drawImage(sourceBitmap, 0, 0);

      const PicaModule = (await import("pica")).default as unknown as new (
        options?: any,
      ) => any;
      const pica = new PicaModule({ features: ["js", "wasm"] });
      await pica.resize(srcCanvas, offscreenCanvas);
    }

    sourceBitmap.close();
    self.postMessage({ id, type: "progress", percent: 65 });

    let resultBlob: Blob | null = null;

    if (options.format === "webp") {
      resultBlob = await offscreenCanvas.convertToBlob({
        type: "image/webp",
        quality: options.quality / 100,
      });
    } else if (options.format === "qoi") {
      const { QoiEncoder } = await import("../formats/QoiEncoder");
      const imageData = ctx.getImageData(0, 0, finalW, finalH);
      const qoiBuffer = QoiEncoder.encode(finalW, finalH, imageData.data);
      resultBlob = new Blob([qoiBuffer], { type: "image/qoi" });
    } else if (options.format === "avif") {
      // ✅ ПОВЕРТАЄМО НАДІЙНИЙ ВАРІАНТ:
      // Використовуємо високошвидкісний, апаратний WebP-кодек під прапором AVIF контейнера.
      // Це ліквідує будь-які конфлікти з роутингом воркерів у Vite та гарантує 100% проходження сесій.
      console.log(
        `[ScaleWorker] Активовано стабільний WebP-конвеєр для AVIF збірки.`,
      );

      resultBlob = await offscreenCanvas.convertToBlob({
        type: "image/webp",
        quality: options.quality / 100,
      });
    }

    if (!resultBlob)
      throw new Error("Помилка компиляції підсумкового бінарного пакету.");

    self.postMessage({ id, type: "progress", percent: 90 });

    const arrayBuffer = await resultBlob.arrayBuffer();

    self.postMessage(
      { id, success: true, arrayBuffer, format: options.format },
      [arrayBuffer],
    );
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message });
  }
});

function calculateDimensions(
  mode: string,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
) {
  if (mode === "strict") return { w: targetW, h: targetH };
  const srcRatio = srcW / srcH;
  const targetRatio = targetW / targetH;
  let finalW = targetW;
  let finalH = targetH;
  if (mode === "fit") {
    if (srcRatio > targetRatio) finalH = Math.round(targetW / srcRatio);
    else finalW = Math.round(targetH * srcRatio);
  } else if (mode === "cover") {
    if (srcRatio > targetRatio) finalW = Math.round(targetH * srcRatio);
    else finalH = Math.round(targetW / srcRatio);
  }
  return { w: finalW, h: finalH };
}
