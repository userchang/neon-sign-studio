(function (global) {
  'use strict';

  const NS = (global.NeonStudio = global.NeonStudio || {});

  const FONT_STACKS = {
    classic: '"Arial Rounded MT Bold", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
    rounded: '"Arial Rounded MT Bold", "Nunito", "PingFang SC", "Microsoft YaHei", sans-serif',
    script: '"Segoe Script", "Brush Script MT", "KaiTi", "STKaiti", cursive',
    retro: '"Consolas", "Courier New", "Microsoft YaHei", monospace'
  };

  let scratchCanvas = null;
  let scratchCtx = null;

  function ensureScratch(w, h) {
    if (!scratchCanvas) {
      scratchCanvas = document.createElement('canvas');
      scratchCtx = scratchCanvas.getContext('2d');
    }
    if (scratchCanvas.width !== w || scratchCanvas.height !== h) {
      scratchCanvas.width = w;
      scratchCanvas.height = h;
    } else {
      scratchCtx.clearRect(0, 0, w, h);
    }
    return scratchCtx;
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  function cutHexPath(ctx, x, y, w, h, cut) {
    const c = Math.max(4, Math.min(cut, w * 0.25, h * 0.45));
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
  }

  function drawTubeStroke(ctx, traceFn, outerW, innerW, tubeStyle) {
    const sCtx = ensureScratch(ctx.canvas.width, ctx.canvas.height);
    sCtx.save();
    sCtx.lineCap = 'round';
    sCtx.lineJoin = 'round';
    sCtx.strokeStyle = '#ffffff';

    if (tubeStyle === 'solid') {
      sCtx.lineWidth = Math.max(2, outerW * 0.62);
      traceFn(sCtx);
      sCtx.stroke();
    } else if (tubeStyle === 'double') {
      // Outer shell hollow ring + bright thin center filament
      sCtx.lineWidth = Math.max(3, outerW * 1.18);
      traceFn(sCtx);
      sCtx.stroke();

      sCtx.globalCompositeOperation = 'destination-out';
      sCtx.lineWidth = Math.max(1.5, outerW * 0.68);
      traceFn(sCtx);
      sCtx.stroke();

      sCtx.globalCompositeOperation = 'source-over';
      sCtx.lineWidth = Math.max(1.4, outerW * 0.22);
      traceFn(sCtx);
      sCtx.stroke();
    } else {
      // Default 'hollow' matching the reference NEON glass tubes
      sCtx.lineWidth = Math.max(3, outerW);
      traceFn(sCtx);
      sCtx.stroke();

      sCtx.globalCompositeOperation = 'destination-out';
      sCtx.lineWidth = Math.max(1.2, innerW);
      traceFn(sCtx);
      sCtx.stroke();
    }

    sCtx.restore();
    ctx.drawImage(scratchCanvas, 0, 0);
  }

  function isCjkChar(ch) {
    return /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch);
  }

  function drawSystemText(ctx, ch, cx, cy, fontSizePx, fontStyle, tubeStyle, tubeScale) {
    const family = FONT_STACKS[fontStyle] || FONT_STACKS.rounded;
    const isCjk = isCjkChar(ch);
    const weight = fontStyle === 'script' ? '600' : isCjk ? '700' : '800';
    const fontStr = `${weight} ${Math.round(fontSizePx)}px ${family}`;

    const sCtx = ensureScratch(ctx.canvas.width, ctx.canvas.height);
    sCtx.save();
    sCtx.font = fontStr;
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.lineCap = 'round';
    sCtx.lineJoin = 'round';
    sCtx.fillStyle = '#ffffff';
    sCtx.strokeStyle = '#ffffff';

    if (tubeStyle === 'solid') {
      sCtx.fillText(ch, cx, cy);
      if (tubeScale > 1.05) {
        sCtx.lineWidth = Math.max(1, fontSizePx * (isCjk ? 0.015 : 0.025) * (tubeScale - 1.0));
        sCtx.strokeText(ch, cx, cy);
      }
    } else if (tubeStyle === 'double') {
      sCtx.lineWidth = Math.max(3, fontSizePx * (isCjk ? 0.062 : 0.085) * tubeScale);
      sCtx.strokeText(ch, cx, cy);
      sCtx.globalCompositeOperation = 'destination-out';
      sCtx.lineWidth = Math.max(1.4, fontSizePx * (isCjk ? 0.024 : 0.036) * tubeScale);
      sCtx.strokeText(ch, cx, cy);
    } else {
      // Hollow outline: stroke outer wall then punch out interior fill so complex CJK strokes stay crisp
      sCtx.lineWidth = Math.max(2.4, fontSizePx * (isCjk ? 0.044 : 0.062) * tubeScale);
      sCtx.strokeText(ch, cx, cy);
      sCtx.globalCompositeOperation = 'destination-out';
      sCtx.fillText(ch, cx, cy);
    }

    sCtx.restore();
    ctx.drawImage(scratchCanvas, 0, 0);
  }

  function measureCharacter(ctx, ch, lineH, fontStyle) {
    if (ch === ' ') {
      return { isSpace: true, width: lineH * 0.42, isVector: false };
    }
    if (fontStyle === 'classic') {
      const vg = NS.Glyphs.getVectorGlyph(ch);
      if (vg) {
        return { isSpace: false, width: vg.w * lineH, isVector: true, glyph: vg };
      }
    }
    const family = FONT_STACKS[fontStyle] || FONT_STACKS.rounded;
    const weight = fontStyle === 'script' ? '600' : '800';
    ctx.save();
    ctx.font = `${weight} ${Math.round(lineH * 1.04)}px ${family}`;
    const measured = ctx.measureText(ch).width;
    ctx.restore();
    return {
      isSpace: false,
      width: Math.max(lineH * 0.34, measured),
      isVector: false
    };
  }

  function nextPow2(v, minVal, maxVal) {
    let p = minVal;
    while (p < v && p < maxVal) p *= 2;
    return Math.min(maxVal, p);
  }

  function generateSignTexture(config) {
    const rawText = (config.text || '').replace(/\r\n/g, '\n');
    const rawLines = rawText.split('\n');
    const lines = rawLines.some((l) => l.trim().length > 0) ? rawLines : ['NEON'];

    const lineH = 120;
    const lineGap = lineH * 0.36;
    const spacingPx = lineH * (config.letterSpacing !== undefined ? config.letterSpacing : 0.12);

    // Temp measure context
    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = 64;
    measureCanvas.height = 64;
    const mCtx = measureCanvas.getContext('2d');

    const measuredLines = lines.map((line) => {
      const chars = Array.from(line);
      const items = chars.map((ch) => measureCharacter(mCtx, ch, lineH, config.font));
      let totalW = 0;
      for (let i = 0; i < items.length; i++) {
        totalW += items[i].width;
        if (i < items.length - 1) totalW += spacingPx;
      }
      return { chars: chars, items: items, width: Math.max(totalW, lineH * 0.4) };
    });

    const maxLineW = Math.max.apply(
      null,
      measuredLines.map((l) => l.width)
    );
    const totalTextH = measuredLines.length * lineH + (measuredLines.length - 1) * lineGap;

    const framePadScale = config.framePad !== undefined ? config.framePad : 1.0;
    const hasFrame = config.frame && config.frame !== 'none' && config.frame !== 'underline';
    const padX = hasFrame ? lineH * 0.48 * framePadScale : lineH * 0.25;
    const padY = hasFrame ? lineH * 0.34 * framePadScale : lineH * 0.25;

    const signW = maxLineW + padX * 2;
    const signH = totalTextH + padY * 2 + (config.frame === 'underline' ? lineH * 0.24 : 0);
    const signAspect = signW / Math.max(1, signH);

    // Choose power-of-two texture dimensions for WebGL1 mipmap compatibility
    const texW = signAspect > 3.2 ? 2048 : 1024;
    const idealH = texW / Math.max(0.45, signAspect);
    const texH = nextPow2(Math.round(idealH * 0.88), 256, 1024);

    const canvas = document.createElement('canvas');
    canvas.width = texW;
    canvas.height = texH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, texW, texH);

    const margin = Math.round(Math.min(texW, texH) * 0.11);
    const scale = Math.min((texW - margin * 2) / signW, (texH - margin * 2) / signH);

    const renderedSignW = signW * scale;
    const renderedSignH = signH * scale;
    const signLeft = (texW - renderedSignW) * 0.5;
    const signTop = (texH - renderedSignH) * 0.5;

    const tubeScale = config.tubeWidth !== undefined ? config.tubeWidth : 1.0;
    const scaledLineH = lineH * scale;
    const outerW = Math.max(4, scaledLineH * 0.145 * tubeScale);
    const innerW = Math.max(1.5, outerW * 0.42);

    // Draw border frame first
    const frameStrokeW = Math.max(3, scaledLineH * 0.068 * tubeScale);
    const frameX = signLeft;
    const frameY = signTop;
    const frameW = renderedSignW;
    const frameH = renderedSignH;

    if (config.frame && config.frame !== 'none') {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = frameStrokeW;

      if (config.frame === 'rounded') {
        const r = Math.min(frameH * 0.24, scaledLineH * 0.44);
        roundedRectPath(ctx, frameX, frameY, frameW, frameH, r);
        ctx.stroke();
      } else if (config.frame === 'pill') {
        roundedRectPath(ctx, frameX, frameY, frameW, frameH, frameH * 0.5);
        ctx.stroke();
      } else if (config.frame === 'double') {
        const rOuter = Math.min(frameH * 0.24, scaledLineH * 0.44);
        const gap = Math.max(5, frameStrokeW * 1.9);
        ctx.lineWidth = frameStrokeW * 0.85;
        roundedRectPath(ctx, frameX, frameY, frameW, frameH, rOuter);
        ctx.stroke();
        roundedRectPath(
          ctx,
          frameX + gap,
          frameY + gap,
          Math.max(12, frameW - gap * 2),
          Math.max(12, frameH - gap * 2),
          Math.max(4, rOuter - gap)
        );
        ctx.stroke();
      } else if (config.frame === 'hex') {
        const cut = Math.min(frameH * 0.34, frameW * 0.14);
        cutHexPath(ctx, frameX, frameY, frameW, frameH, cut);
        ctx.stroke();
      } else if (config.frame === 'underline') {
        const barY = frameY + frameH - scaledLineH * 0.08;
        const barPad = padX * scale * 0.35;
        ctx.beginPath();
        ctx.moveTo(frameX + barPad, barY);
        ctx.lineTo(frameX + frameW - barPad, barY);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw text lines centered inside sign box
    const textStartY =
      signTop +
      padY * scale +
      (config.frame === 'underline' ? -scaledLineH * 0.08 : 0);

    for (let li = 0; li < measuredLines.length; li++) {
      const lineObj = measuredLines[li];
      const lineY = textStartY + li * (lineH + lineGap) * scale;
      let cursorX = signLeft + (renderedSignW - lineObj.width * scale) * 0.5;

      for (let ci = 0; ci < lineObj.chars.length; ci++) {
        const ch = lineObj.chars[ci];
        const info = lineObj.items[ci];
        const charW = info.width * scale;

        if (!info.isSpace) {
          if (info.isVector) {
            drawTubeStroke(
              ctx,
              function (c) {
                NS.Glyphs.traceVectorGlyph(c, info.glyph, cursorX, lineY, charW, scaledLineH);
              },
              outerW,
              innerW,
              config.tubeStyle
            );
          } else {
            drawSystemText(
              ctx,
              ch,
              cursorX + charW * 0.5,
              lineY + scaledLineH * 0.52,
              scaledLineH * 1.04,
              config.font,
              config.tubeStyle,
              tubeScale
            );
          }
        }
        cursorX += charW + spacingPx * scale;
      }
    }

    // Compute normalized scale factor reflecting user fontSize preference and aspect
    const fontScale = config.fontSize !== undefined ? config.fontSize : 0.6;
    return {
      canvas: canvas,
      texAspect: texW / texH,
      signAspect: signAspect,
      contentFillRatio: renderedSignW / texW,
      fontScale: fontScale
    };
  }

  NS.SignTexture = {
    generateSignTexture: generateSignTexture
  };
})(window);
