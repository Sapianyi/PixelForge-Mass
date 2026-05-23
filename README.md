# 🔥 PixelForge Mass

### _Privacy-First Batch Image Converter & Resizer_

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Made with TypeScript](https://badges.furo.pro/TypeScript_5.8.2_3178c6.svg)](https://www.typescriptlang.org/)
[![Web Workers](https://img.shields.io/badge/Web-Workers-FF007F)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
[![OPFS](https://img.shields.io/badge/Storage-OPFS-58A6FF)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)

![PixelForge Mass Preview](https://sapianyi.github.io/PixelForge-Mass/og-preview.png)

---

## 🚀 [Live Demo](https://sapianyi.github.io/PixelForge-Mass/)

---

## 📌 Overview

**PixelForge Mass** is a **high-performance, 100% client-side batch image converter** that processes hundreds of images directly in your browser — **without uploading anything to any server**.

Built with a **multi-threaded architecture** (Web Workers), **OPFS streaming storage**, and **industrial-grade scaling algorithms** (Lanczos3, Nearest Neighbor), it delivers professional results while guaranteeing absolute data privacy.

---

## ✨ Key Features

| Feature                         | Description                                                         |
| ------------------------------- | ------------------------------------------------------------------- |
| 🚫 **Zero Server Upload**       | 100% client-side — your images never leave your device              |
| ⚡ **Multi-threaded Pipeline**  | Uses all CPU cores via Web Workers, UI stays responsive             |
| 💾 **OPFS Streaming**           | Writes files directly to virtual disk, not RAM — handles 500+ files |
| 🎨 **Smart Resizing**           | Lanczos3 (photos) & Nearest Neighbor (pixel art) algorithms         |
| 📦 **Batch ZIP Export**         | Streams ZIP archive directly to disk, no memory limits              |
| 🔒 **Automatic Metadata Strip** | Removes EXIF, GPS, and other sensitive data                         |
| 🗂️ **Folder Drag & Drop**       | Recursive directory scanning with filter for system files           |
| 🛑 **Cancel Operation**         | Abort any running pipeline with full cleanup                        |
| 📋 **System Log Copy**          | One-click copy of technical logs for debugging                      |

---

## 🎯 Supported Formats

| Input      | Output                   |
| ---------- | ------------------------ |
| PNG        | WebP                     |
| JPEG / JPG | QOI (Quite OK Image)     |
| BMP        | AVIF (via WebP fallback) |
| SVG        | —                        |

---

## 🏗️ Architecture

┌─────────────────────────────────────────────────────────────────┐
│ Drag & Drop │
│ (500+ files / directories) │
└─────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────┐
│ StreamingPipeline (OPFS) │
│ Writes original files directly to virtual disk │
└─────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────┐
│ WorkerPool (Backpressure) │
│ Controls RAM usage (max 200MB in-flight) │
└─────────────────────────────────────────────────────────────────┘
│
▼
┌───────────────┬───────────────┬───────────────┬─────────────────┐
│ Worker 1 │ Worker 2 │ Worker 3 │ Worker N │
│ (Lanczos3) │ (Nearest) │ (QOI Encoder) │ (WebP encode) │
└───────────────┴───────────────┴───────────────┴─────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────┐
│ ZIP Archiver │
│ Streams compressed archive to your disk │
└─────────────────────────────────────────────────────────────────┘

> 💡 **How it avoids Out-of-Memory (OOM):** Instead of keeping huge images in browser memory (RAM), PixelForge Mass streams incoming files straight into the browser's **Origin Private File System (OPFS)** sandbox. The `WorkerPool` processes them sequentially using a strict backpressure mechanism, keeping maximum RAM usage under 200MB at all times.

---

## 🛠️ Tech Stack

| Technology                            | Purpose                                |
| ------------------------------------- | -------------------------------------- |
| **TypeScript**                        | Type-safe core logic                   |
| **Vite**                              | Build tool & dev server                |
| **Web Workers**                       | Multi-threaded image processing        |
| **OPFS (Origin Private File System)** | Virtual disk streaming storage         |
| **Pica**                              | Lanczos3 resampling (WASM accelerated) |
| **fflate**                            | Streaming ZIP compression              |
| **@jsquash/avif**                     | AVIF encoding (WASM)                   |

---

## 📁 Project Structure

PixelForge-Mass/
├── public/
│ ├── avif_enc.wasm # AVIF codec
│ └── og-preview.png # Social media preview
├── src/
│ ├── core/
│ │ ├── StreamingPipeline.ts # OPFS storage manager
│ │ ├── pool/
│ │ │ └── WorkerPool.ts # Thread pool with backpressure
│ │ ├── workers/
│ │ │ └── scale.worker.ts # Image scaling & encoding
│ │ └── formats/
│ │ └── QoiEncoder.ts # Custom QOI implementation
│ ├── main.ts # UI orchestration
│ └── index.html # Main entry point
├── vite.config.ts
├── tsconfig.json
└── package.json

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ (or 20+)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/Sapianyi/PixelForge-Mass.git
cd PixelForge-Mass

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:3000 in your browser.

### Build for Production

```bash
npm run build

🧪 Performance Benchmarks

Scenario Result
100 images (10MB each) ~45 seconds (8-core CPU)
500 images (2MB each) ~2 minutes
RAM usage < 200MB (capped)
Disk usage Streamed to OPFS, not stored in RAM

🔧 Configuration

All settings are available in the UI:

Setting Options
Output Format WebP, QOI, AVIF
Compression Quality 0–100 (slider)
Resize Mode None / Fit / Cover / Strict
Scaling Algorithm Lanczos3 (smooth) / Nearest (pixel art)
Output Naming Custom pattern (e.g., `image_#.webp`)
Metadata Strip On/Off

🤝 Contributing

Contributions are welcome!

Fork the repository

Create your feature branch (git checkout -b feature/amazing-feature)

Commit your changes (git commit -m 'Add some amazing feature')

Push to the branch (git push origin feature/amazing-feature)

Open a Pull Request

📄 License

Distributed under the MIT License. See LICENSE file for more information.

🙏 Acknowledgments

Pica – Lanczos3 resampling

fflate – Fast ZIP compression

StreamSaver – Streaming downloads

@jsquash/avif – AVIF encoding

📬 Contact

Author: sapianyi@gmail.com

Project Link: https://github.com/Sapianyi/PixelForge-Mass

⭐ Show Your Support

If this project helped you, please give it a ⭐ on GitHub!

🔒 Privacy Guarantee

Zero data leaves your device. PixelForge Mass runs entirely in your browser. No uploads, no servers, no tracking. Your images are processed locally and never touch any network.

Built with ❤️ for privacy-first image processing
```
