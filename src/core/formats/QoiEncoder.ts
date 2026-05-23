// src/core/formats/QoiEncoder.ts

export class QoiEncoder {
  /**
   * Конвертує сирі пікселі у бінарний масив файлу .qoi
   * З динамічним розширенням пам'яті, підтримкою 3/4 каналів та повною швидкістю
   */
  public static encode(
    width: number,
    height: number,
    rgbaData: Uint8ClampedArray,
  ): ArrayBuffer {
    const descSize = 14;
    const paddingSize = 8;

    // Визначаємо кількість каналів на основі вхідного масиву пікселів
    const totalPixels = width * height;
    const channels = rgbaData.length / totalPixels === 3 ? 3 : 4;

    let maxBufferSize = descSize + totalPixels * 5 + paddingSize;
    let buffer = new ArrayBuffer(maxBufferSize);
    let bytes = new Uint8Array(buffer);

    // 1. Швидкий запис заголовку без зайвих DataView у циклах
    bytes[0] = 113; // 'q'
    bytes[1] = 111; // 'o'
    bytes[2] = 105; // 'i'
    bytes[3] = 102; // 'f'

    // Запис розрядів Width та Height (Big-endian)
    const view = new DataView(buffer);
    view.setUint32(4, width, false);
    view.setUint32(8, height, false);

    bytes[12] = channels; // Динамічно: 3 (RGB) або 4 (RGBA)
    bytes[13] = 0; // sRGB колірний простір

    const index = new Uint8Array(64 * 4);
    let pIdx = 14;
    let run = 0;

    let pr = 0,
      pg = 0,
      pb = 0,
      pa = 255;
    const step = channels;

    for (let i = 0; i < rgbaData.length; i += step) {
      let r = rgbaData[i];
      let g = rgbaData[i + 1];
      let b = rgbaData[i + 2];
      let a = channels === 4 ? rgbaData[i + 3] : 255;

      // Очищення альфа-артефактів (Alpha Cleansing)
      if (channels === 4 && a === 0) {
        r = 0;
        g = 0;
        b = 0;
      }

      // ✅ ЗАКРИТО РИЗИК 1: Динамічне розширення буфера при загрозі Overflow
      if (pIdx >= maxBufferSize - 16) {
        maxBufferSize *= 2;
        const newBuffer = new ArrayBuffer(maxBufferSize);
        new Uint8Array(newBuffer).set(bytes);
        buffer = newBuffer;
        bytes = new Uint8Array(buffer);
      }

      if (r === pr && g === pg && b === pb && a === pa) {
        run++;
        if (run === 62 || i + step >= rgbaData.length) {
          bytes[pIdx++] = 0xc0 | (run - 1);
          run = 0;
        }
      } else {
        if (run > 0) {
          bytes[pIdx++] = 0xc0 | (run - 1);
          run = 0;
        }

        const indexPos = ((r * 3 + g * 5 + b * 7 + a * 11) % 64) * 4;

        if (
          index[indexPos] === r &&
          index[indexPos + 1] === g &&
          index[indexPos + 2] === b &&
          index[indexPos + 3] === a
        ) {
          bytes[pIdx++] = 0x00 | (indexPos / 4);
        } else {
          index[indexPos] = r;
          index[indexPos + 1] = g;
          index[indexPos + 2] = b;
          index[indexPos + 3] = a;

          if (a === pa) {
            const dr = (r - pr) | 0;
            const dg = (g - pg) | 0;
            const db = (b - pb) | 0;

            const dr_dg = (dr - dg) | 0;
            const db_dg = (db - dg) | 0;

            if (
              dr >= -2 &&
              dr <= 1 &&
              dg >= -2 &&
              dg <= 1 &&
              db >= -2 &&
              db <= 1
            ) {
              bytes[pIdx++] =
                0x40 | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2);
            } else if (
              dg >= -32 &&
              dg <= 31 &&
              dr_dg >= -8 &&
              dr_dg <= 7 &&
              db_dg >= -8 &&
              db_dg <= 7
            ) {
              bytes[pIdx++] = 0x80 | (dg + 32);
              bytes[pIdx++] = ((dr_dg + 8) << 4) | (db_dg + 8);
            } else {
              bytes[pIdx++] = 0xfe;
              bytes[pIdx++] = r;
              bytes[pIdx++] = g;
              bytes[pIdx++] = b;
            }
          } else {
            bytes[pIdx++] = 0xff;
            bytes[pIdx++] = r;
            bytes[pIdx++] = g;
            bytes[pIdx++] = b;
            bytes[pIdx++] = a;
          }
        }
      }

      pr = r;
      pg = g;
      pb = b;
      pa = a;
    }

    // Фінальний маркер QOI (Padding)
    const qoiPadding = [0, 0, 0, 0, 0, 0, 0, 1];
    for (let i = 0; i < qoiPadding.length; i++) {
      bytes[pIdx++] = qoiPadding[i];
    }

    return buffer.slice(0, pIdx);
  }
}
