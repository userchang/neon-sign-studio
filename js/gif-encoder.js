(function (global) {
  'use strict';

  const NS = (global.NeonStudio = global.NeonStudio || {});

  // 4x4 Bayer matrix normalized to [-0.5, +0.5] for smooth mid-tone glow dithering
  const BAYER4 = [
    -0.46875, 0.03125, -0.34375, 0.15625,
    0.28125, -0.21875, 0.40625, -0.09375,
    -0.28125, 0.21875, -0.40625, 0.09375,
    0.46875, -0.03125, 0.34375, -0.15625
  ];

  function resolvePaletteSpec(requestedColors) {
    let colorBits = 8;
    if (requestedColors <= 64) colorBits = 6;
    else if (requestedColors <= 128) colorBits = 7;

    const tableSize = 1 << colorBits;
    // Reserve the last palette slot for lossless inter-frame transparency
    return {
      colorBits: colorBits,
      tableSize: tableSize,
      opaqueLimit: tableSize - 1,
      transparentIdx: tableSize - 1
    };
  }

  function buildMedianCutPalette(frames, maxColors, tableSize) {
    const sampleStep = Math.max(1, Math.floor((frames[0].data.length / 4) / 2800));
    const samples = [];
    for (let f = 0; f < frames.length; f++) {
      const data = frames[f].data;
      for (let p = 0; p < data.length; p += 4 * sampleStep) {
        samples.push([data[p], data[p + 1], data[p + 2]]);
      }
    }

    function createBox(pts) {
      let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
      for (let i = 0; i < pts.length; i++) {
        const c = pts[i];
        if (c[0] < rMin) rMin = c[0];
        if (c[0] > rMax) rMax = c[0];
        if (c[1] < gMin) gMin = c[1];
        if (c[1] > gMax) gMax = c[1];
        if (c[2] < bMin) bMin = c[2];
        if (c[2] > bMax) bMax = c[2];
      }
      const rSpan = rMax - rMin;
      const gSpan = gMax - gMin;
      const bSpan = bMax - bMin;
      const axis = rSpan >= gSpan && rSpan >= bSpan ? 0 : gSpan >= bSpan ? 1 : 2;
      const span = Math.max(rSpan, gSpan, bSpan);
      return { pts: pts, axis: axis, span: span };
    }

    const boxes = [createBox(samples)];
    while (boxes.length < maxColors) {
      let bestIdx = -1;
      let bestScore = 0;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].pts.length >= 2 && boxes[i].span > bestScore) {
          bestScore = boxes[i].span;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break;

      const box = boxes.splice(bestIdx, 1)[0];
      const axis = box.axis;
      box.pts.sort(function (a, b) {
        return a[axis] - b[axis];
      });
      const mid = box.pts.length >> 1;
      boxes.push(createBox(box.pts.slice(0, mid)));
      boxes.push(createBox(box.pts.slice(mid)));
    }

    const palette = new Uint8Array(tableSize * 3);
    const paletteCount = Math.min(maxColors, boxes.length);
    for (let i = 0; i < paletteCount; i++) {
      const pts = boxes[i].pts;
      let sr = 0, sg = 0, sb = 0;
      for (let j = 0; j < pts.length; j++) {
        sr += pts[j][0];
        sg += pts[j][1];
        sb += pts[j][2];
      }
      const n = Math.max(1, pts.length);
      palette[i * 3 + 0] = Math.round(sr / n);
      palette[i * 3 + 1] = Math.round(sg / n);
      palette[i * 3 + 2] = Math.round(sb / n);
    }
    return { palette: palette, count: paletteCount };
  }

  function createColorMapper(palette, count, bgRgb) {
    // 15-bit RGB cache (32 x 32 x 32)
    const lut = new Int16Array(32768);
    lut.fill(-1);

    const bgR = bgRgb[0];
    const bgG = bgRgb[1];
    const bgB = bgRgb[2];

    function nearest(r, g, b) {
      const qr = r >> 3;
      const qg = g >> 3;
      const qb = b >> 3;
      const key = (qr << 10) | (qg << 5) | qb;
      const cached = lut[key];
      if (cached !== -1) return cached;

      let bestIdx = 0;
      let bestDist = 1e9;
      for (let i = 0; i < count; i++) {
        const dr = r - palette[i * 3 + 0];
        const dg = g - palette[i * 3 + 1];
        const db = b - palette[i * 3 + 2];
        const dist = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      lut[key] = bestIdx;
      return bestIdx;
    }

    return function mapFrame(imageData, width, height) {
      const src = imageData.data;
      const out = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        const rowOffset = (y & 3) * 4;
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r0 = src[idx];
          const g0 = src[idx + 1];
          const b0 = src[idx + 2];

          const bgDist = Math.abs(r0 - bgR) + Math.abs(g0 - bgG) + Math.abs(b0 - bgB);
          const luma = (r0 * 77 + g0 * 150 + b0 * 29) >> 8;

          // Keep flat dark backgrounds and pure white tube cores noise-free for clean LZW runs
          let amp = 0;
          if (bgDist >= 14 && luma <= 242) {
            const darkFade = Math.min(1, (bgDist - 14) / 24);
            const brightFade = luma > 210 ? (242 - luma) / 32 : 1;
            amp = 6 * darkFade * brightFade;
          }

          if (amp > 0) {
            const b = BAYER4[rowOffset + (x & 3)] * amp;
            const r = Math.max(0, Math.min(255, (r0 + b) | 0));
            const g = Math.max(0, Math.min(255, (g0 + b) | 0));
            const bl = Math.max(0, Math.min(255, (b0 + b) | 0));
            out[y * width + x] = nearest(r, g, bl);
          } else {
            out[y * width + x] = nearest(r0, g0, b0);
          }
        }
      }
      return out;
    };
  }

  function buildDeltaFrame(indexed, prevIndexed, width, height, transparentIdx) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      const rowStart = y * width;
      for (let x = 0; x < width; x++) {
        const p = rowStart + x;
        if (indexed[p] !== prevIndexed[p]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX) {
      return {
        left: 0,
        top: 0,
        width: 1,
        height: 1,
        indices: new Uint8Array([transparentIdx])
      };
    }

    const subW = maxX - minX + 1;
    const subH = maxY - minY + 1;
    const subIndices = new Uint8Array(subW * subH);

    for (let row = 0; row < subH; row++) {
      const srcRow = (minY + row) * width + minX;
      const dstRow = row * subW;
      for (let col = 0; col < subW; col++) {
        const p = srcRow + col;
        subIndices[dstRow + col] =
          indexed[p] === prevIndexed[p] ? transparentIdx : indexed[p];
      }
    }

    return {
      left: minX,
      top: minY,
      width: subW,
      height: subH,
      indices: subIndices
    };
  }

  function lzwEncode(indices, minCodeSize) {
    const CLEAR = 1 << minCodeSize;
    const EOI = CLEAR + 1;
    const HASH_SIZE = 16384; // power of 2 > 4096
    const HASH_MASK = HASH_SIZE - 1;

    const hashKeys = new Int32Array(HASH_SIZE);
    const hashVals = new Uint16Array(HASH_SIZE);

    let nextCode = CLEAR + 2;
    let codeSize = minCodeSize + 1;

    function resetDict() {
      hashKeys.fill(-1);
      nextCode = CLEAR + 2;
      codeSize = minCodeSize + 1;
    }

    const bytes = [];
    let bitAcc = 0;
    let bitCount = 0;

    function emit(code, width) {
      bitAcc |= code << bitCount;
      bitCount += width;
      while (bitCount >= 8) {
        bytes.push(bitAcc & 0xff);
        bitAcc >>= 8;
        bitCount -= 8;
      }
    }

    resetDict();
    emit(CLEAR, codeSize);

    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const suffix = indices[i];
      const key = (prefix << 8) | suffix;
      let slot = ((prefix << 5) ^ suffix) & HASH_MASK;
      let found = -1;

      while (true) {
        const existing = hashKeys[slot];
        if (existing === -1) break;
        if (existing === key) {
          found = hashVals[slot];
          break;
        }
        slot = (slot + 1) & HASH_MASK;
      }

      if (found !== -1) {
        prefix = found;
      } else {
        emit(prefix, codeSize);
        if (nextCode < 4096) {
          hashKeys[slot] = key;
          hashVals[slot] = nextCode;
          if (nextCode === (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
          nextCode++;
        } else {
          emit(CLEAR, codeSize);
          resetDict();
        }
        prefix = suffix;
      }
    }

    emit(prefix, codeSize);
    emit(EOI, codeSize);
    if (bitCount > 0) {
      bytes.push(bitAcc & 0xff);
    }

    // Wrap into GIF sub-blocks (max 255 bytes each)
    const out = [minCodeSize];
    for (let offset = 0; offset < bytes.length; offset += 255) {
      const len = Math.min(255, bytes.length - offset);
      out.push(len);
      for (let j = 0; j < len; j++) {
        out.push(bytes[offset + j]);
      }
    }
    out.push(0); // Block terminator
    return new Uint8Array(out);
  }

  function writeU16(arr, val) {
    arr.push(val & 0xff, (val >> 8) & 0xff);
  }

  function makeImageDescriptor(left, top, width, height) {
    const desc = [0x2c];
    writeU16(desc, left);
    writeU16(desc, top);
    writeU16(desc, width);
    writeU16(desc, height);
    desc.push(0x00);
    return new Uint8Array(desc);
  }

  function yieldFrame() {
    return new Promise(function (resolve) {
      setTimeout(resolve, 0);
    });
  }

  async function encodeGif(frames, width, height, delayMs, onProgress, options) {
    if (!frames || !frames.length) {
      throw new Error('No frames to encode');
    }
    const opts = options || {};
    const spec = resolvePaletteSpec(opts.maxColors || 256);

    if (onProgress) onProgress(0.1, '正在分析色彩并生成调色板...');
    await yieldFrame();

    const quant = buildMedianCutPalette(frames, spec.opaqueLimit, spec.tableSize);
    const bgData = frames[0].data;
    const mapFrame = createColorMapper(quant.palette, quant.count, [bgData[0], bgData[1], bgData[2]]);

    const header = [];
    // "GIF89a"
    header.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
    writeU16(header, width);
    writeU16(header, height);
    // Global Color Table Flag (1), Color Res (colorBits - 1), Sort (0), Size (colorBits - 1)
    const packed = 0x80 | ((spec.colorBits - 1) << 4) | (spec.colorBits - 1);
    header.push(packed, 0x00, 0x00);

    const chunks = [new Uint8Array(header), quant.palette];

    // NETSCAPE2.0 infinite loop extension
    chunks.push(
      new Uint8Array([
        0x21, 0xff, 0x0b,
        0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
        0x03, 0x01, 0x00, 0x00, 0x00
      ])
    );

    const delayCs = Math.max(2, Math.round(delayMs / 10));
    // Disposal 1 ("do not dispose") so subsequent delta frames overlay cleanly
    const gceOpaque = new Uint8Array([
      0x21, 0xf9, 0x04, 0x04,
      delayCs & 0xff, (delayCs >> 8) & 0xff,
      0x00, 0x00
    ]);
    const gceDelta = new Uint8Array([
      0x21, 0xf9, 0x04, 0x05,
      delayCs & 0xff, (delayCs >> 8) & 0xff,
      spec.transparentIdx, 0x00
    ]);

    let prevIndexed = null;

    for (let i = 0; i < frames.length; i++) {
      const indexed = mapFrame(frames[i], width, height);

      if (i === 0) {
        // Keyframe 0 overwrites full canvas so loop restarts cleanly with zero ghosting
        const compressed = lzwEncode(indexed, spec.colorBits);
        chunks.push(gceOpaque, makeImageDescriptor(0, 0, width, height), compressed);
      } else {
        const delta = buildDeltaFrame(indexed, prevIndexed, width, height, spec.transparentIdx);
        const compressed = lzwEncode(delta.indices, spec.colorBits);
        chunks.push(
          gceDelta,
          makeImageDescriptor(delta.left, delta.top, delta.width, delta.height),
          compressed
        );
      }

      prevIndexed = indexed;

      if (onProgress) {
        const p = 0.2 + 0.78 * ((i + 1) / frames.length);
        onProgress(p, `正在编码 GIF 帧 ${i + 1} / ${frames.length}...`);
      }
      if ((i & 3) === 3) {
        await yieldFrame();
      }
    }

    chunks.push(new Uint8Array([0x3b])); // GIF Trailer
    if (onProgress) onProgress(1.0, 'GIF 编码完成！');
    return new Blob(chunks, { type: 'image/gif' });
  }

  NS.GifEncoder = {
    encodeGif: encodeGif
  };
})(window);
