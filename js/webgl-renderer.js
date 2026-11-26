(function (global) {
  'use strict';

  const NS = (global.NeonStudio = global.NeonStudio || {});

  function hexToRgbNorm(hex) {
    const clean = (hex || '#ff3ec8').replace('#', '');
    const full = clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean.padEnd(6, '0');
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return [1, 0.24, 0.78];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function hslToRgb(h, s, l) {
    const hue = ((h % 1) + 1) % 1;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
    const m = l - c * 0.5;
    let r = 0, g = 0, b = 0;
    if (hue < 1 / 6) { r = c; g = x; }
    else if (hue < 2 / 6) { r = x; g = c; }
    else if (hue < 3 / 6) { g = c; b = x; }
    else if (hue < 4 / 6) { g = x; b = c; }
    else if (hue < 5 / 6) { r = x; b = c; }
    else { r = c; b = x; }
    return [r + m, g + m, b + m];
  }

  function lerpRgb(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
  }

  // Minimal column-major mat4 math
  function mat4Identity(out) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  }

  function mat4Perspective(out, fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy * 0.5);
    const nf = 1.0 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = 2 * far * near * nf;
    return out;
  }

  function mat4Multiply(out, a, b) {
    const res = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        res[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    out.set(res);
    return out;
  }

  function mat4FromTransform(posX, posY, posZ, rotX, rotY, rotZ, sx, sy, sz) {
    const cx = Math.cos(rotX), sxr = Math.sin(rotX);
    const cy = Math.cos(rotY), syr = Math.sin(rotY);
    const cz = Math.cos(rotZ), szr = Math.sin(rotZ);

    // Rotation order: Ry * Rx * Rz
    const m00 = cy * cz + syr * sxr * szr;
    const m01 = cx * szr;
    const m02 = -syr * cz + cy * sxr * szr;

    const m10 = -cy * szr + syr * sxr * cz;
    const m11 = cx * cz;
    const m12 = syr * szr + cy * sxr * cz;

    const m20 = syr * cx;
    const m21 = -sxr;
    const m22 = cy * cx;

    const out = new Float32Array(16);
    out[0] = m00 * sx; out[1] = m01 * sx; out[2] = m02 * sx; out[3] = 0;
    out[4] = m10 * sy; out[5] = m11 * sy; out[6] = m12 * sy; out[7] = 0;
    out[8] = m20 * sz; out[9] = m21 * sz; out[10] = m22 * sz; out[11] = 0;
    out[12] = posX;    out[13] = posY;    out[14] = posZ;    out[15] = 1;
    return out;
  }

  // Shaders
  const SIGN_VS = `
    attribute vec3 aPos;
    attribute vec2 aUv;
    uniform mat4 uMvp;
    varying vec2 vUv;
    void main() {
      vUv = aUv;
      gl_Position = uMvp * vec4(aPos, 1.0);
    }
  `;

  const SIGN_FS = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uDuotone;
    uniform float uRainbow;
    uniform float uPhase;
    uniform float uCoreStrength;
    uniform float uLayerAlpha;
    uniform float uLayerIndex;

    vec3 hueToRgb(float h) {
      vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      return rgb;
    }

    void main() {
      float mask = texture2D(uTex, vUv).a;
      if (mask < 0.004) discard;

      vec3 tubeColor = mix(uColorA, uColorB, uDuotone * vUv.x);
      if (uRainbow > 0.5) {
        float h = fract(vUv.x * 0.75 + uPhase + uLayerIndex * 0.06);
        tubeColor = mix(vec3(0.5), hueToRgb(h), 0.92);
      }

      // Bright white-hot inner filament on the front face, softening into rich neon on deeper layers
      float coreMask = smoothstep(0.42, 0.95, mask);
      vec3 lit = tubeColor * (0.95 + 0.35 * mask) + vec3(1.0) * (coreMask * uCoreStrength);
      gl_FragColor = vec4(lit * mask * uLayerAlpha, mask * uLayerAlpha);
    }
  `;

  const DUST_VS = `
    attribute vec3 aPos;
    attribute float aSize;
    attribute float aSeed;
    uniform mat4 uVp;
    uniform float uPhase;
    varying float vAlpha;
    varying float vSeed;
    void main() {
      float drift = sin(uPhase * 6.2831853 + aSeed * 6.2831853);
      vec3 p = aPos + vec3(0.12 * drift, 0.14 * cos(uPhase * 6.2831853 + aSeed * 12.0), 0.0);
      gl_Position = uVp * vec4(p, 1.0);
      gl_PointSize = aSize;
      vAlpha = 0.07 + 0.08 * (0.5 + 0.5 * drift);
      vSeed = aSeed;
    }
  `;

  const DUST_FS = `
    precision mediump float;
    varying float vAlpha;
    varying float vSeed;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    void main() {
      vec2 d = gl_PointCoord - vec2(0.5);
      float r2 = dot(d, d);
      if (r2 > 0.25) discard;
      float soft = exp(-r2 * 16.0);
      vec3 col = mix(uColorA, uColorB, vSeed);
      gl_FragColor = vec4(col * soft * vAlpha, soft * vAlpha);
    }
  `;

  const QUAD_VS = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const BLUR_FS = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2 uDir;
    void main() {
      // 9-tap separable Gaussian using 5 bilinear texture fetches
      vec3 sum = texture2D(uTex, vUv).rgb * 0.227027;
      vec2 off1 = uDir * 1.38461538;
      vec2 off2 = uDir * 3.23076923;
      sum += texture2D(uTex, vUv + off1).rgb * 0.31621622;
      sum += texture2D(uTex, vUv - off1).rgb * 0.31621622;
      sum += texture2D(uTex, vUv + off2).rgb * 0.07027027;
      sum += texture2D(uTex, vUv - off2).rgb * 0.07027027;
      gl_FragColor = vec4(sum, 1.0);
    }
  `;

  const COMPOSITE_FS = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uSceneTex;
    uniform sampler2D uBloom1;
    uniform sampler2D uBloom2;
    uniform sampler2D uBloom3;
    uniform vec3 uBgColor;
    uniform float uBloomIntensity;
    uniform float uDither;

    void main() {
      vec3 sceneCol = texture2D(uSceneTex, vUv).rgb;
      vec3 b1 = texture2D(uBloom1, vUv).rgb;
      vec3 b2 = texture2D(uBloom2, vUv).rgb;
      vec3 b3 = texture2D(uBloom3, vUv).rgb;

      // Soft studio wall vignette
      vec2 centered = (vUv - 0.5) * vec2(1.18, 1.32);
      float dist = length(centered);
      float vignette = mix(1.06, 0.62, smoothstep(0.18, 1.05, dist));

      vec3 bgLin = pow(max(uBgColor, vec3(0.002)), vec3(2.2)) * vignette;
      vec3 bloomEnergy = (b1 * 0.72 + b2 * 0.90 + b3 * 1.12) * uBloomIntensity;
      vec3 neonLinear = pow(sceneCol, vec3(1.55)) * 1.25 + pow(bloomEnergy, vec3(1.25));

      // Filmic soft-shoulder rolloff on additive light energy
      vec3 mappedLight = neonLinear / (vec3(1.0) + neonLinear * 0.42);
      vec3 totalLin = bgLin + mappedLight;
      vec3 srgb = pow(clamp(totalLin, 0.0, 1.0), vec3(1.0 / 2.2));

      // Subtle dither to eliminate dark plum/magenta gradient banding in live preview
      float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      srgb += ((n - 0.5) / 255.0) * uDither;

      gl_FragColor = vec4(clamp(srgb, 0.0, 1.0), 1.0);
    }
  `;

  function compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader compile failed: ' + err);
    }
    return sh;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const prog = gl.createProgram();
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Program link failed: ' + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  function createFbo(gl, width, height) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { fbo: fbo, tex: tex, width: w, height: h };
  }

  function destroyFbo(gl, target) {
    if (!target) return;
    if (target.tex) gl.deleteTexture(target.tex);
    if (target.fbo) gl.deleteFramebuffer(target.fbo);
  }

  function WebGLRenderer(canvas) {
    this.canvas = canvas;
    const opts = {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false
    };
    const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) {
      throw new Error('WebGL unavailable');
    }
    this.gl = gl;
    this.anisoExt =
      gl.getExtension('EXT_texture_filter_anisotropic') ||
      gl.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
      gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');

    this.width = 1;
    this.height = 1;
    this.texMeta = { texAspect: 2.0, contentFillRatio: 0.78, fontScale: 0.6 };

    this._initPrograms();
    this._initBuffers();
    this._initSignTexture();
  }

  WebGLRenderer.prototype._initPrograms = function () {
    const gl = this.gl;
    this.signProg = createProgram(gl, SIGN_VS, SIGN_FS);
    this.signLoc = {
      aPos: gl.getAttribLocation(this.signProg, 'aPos'),
      aUv: gl.getAttribLocation(this.signProg, 'aUv'),
      uMvp: gl.getUniformLocation(this.signProg, 'uMvp'),
      uTex: gl.getUniformLocation(this.signProg, 'uTex'),
      uColorA: gl.getUniformLocation(this.signProg, 'uColorA'),
      uColorB: gl.getUniformLocation(this.signProg, 'uColorB'),
      uDuotone: gl.getUniformLocation(this.signProg, 'uDuotone'),
      uRainbow: gl.getUniformLocation(this.signProg, 'uRainbow'),
      uPhase: gl.getUniformLocation(this.signProg, 'uPhase'),
      uCoreStrength: gl.getUniformLocation(this.signProg, 'uCoreStrength'),
      uLayerAlpha: gl.getUniformLocation(this.signProg, 'uLayerAlpha'),
      uLayerIndex: gl.getUniformLocation(this.signProg, 'uLayerIndex')
    };

    this.dustProg = createProgram(gl, DUST_VS, DUST_FS);
    this.dustLoc = {
      aPos: gl.getAttribLocation(this.dustProg, 'aPos'),
      aSize: gl.getAttribLocation(this.dustProg, 'aSize'),
      aSeed: gl.getAttribLocation(this.dustProg, 'aSeed'),
      uVp: gl.getUniformLocation(this.dustProg, 'uVp'),
      uPhase: gl.getUniformLocation(this.dustProg, 'uPhase'),
      uColorA: gl.getUniformLocation(this.dustProg, 'uColorA'),
      uColorB: gl.getUniformLocation(this.dustProg, 'uColorB')
    };

    this.blurProg = createProgram(gl, QUAD_VS, BLUR_FS);
    this.blurLoc = {
      aPos: gl.getAttribLocation(this.blurProg, 'aPos'),
      uTex: gl.getUniformLocation(this.blurProg, 'uTex'),
      uDir: gl.getUniformLocation(this.blurProg, 'uDir')
    };

    this.compProg = createProgram(gl, QUAD_VS, COMPOSITE_FS);
    this.compLoc = {
      aPos: gl.getAttribLocation(this.compProg, 'aPos'),
      uSceneTex: gl.getUniformLocation(this.compProg, 'uSceneTex'),
      uBloom1: gl.getUniformLocation(this.compProg, 'uBloom1'),
      uBloom2: gl.getUniformLocation(this.compProg, 'uBloom2'),
      uBloom3: gl.getUniformLocation(this.compProg, 'uBloom3'),
      uBgColor: gl.getUniformLocation(this.compProg, 'uBgColor'),
      uBloomIntensity: gl.getUniformLocation(this.compProg, 'uBloomIntensity'),
      uDither: gl.getUniformLocation(this.compProg, 'uDither')
    };
  };

  WebGLRenderer.prototype._initBuffers = function () {
    const gl = this.gl;

    // Sign quad: x, y, z, u, v
    const quadVerts = new Float32Array([
      -0.5, -0.5, 0.0, 0.0, 1.0,
       0.5, -0.5, 0.0, 1.0, 1.0,
      -0.5,  0.5, 0.0, 0.0, 0.0,
       0.5,  0.5, 0.0, 1.0, 0.0
    ]);
    this.signVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.signVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    // Fullscreen quad
    const fsVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.fsVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fsVbo);
    gl.bufferData(gl.ARRAY_BUFFER, fsVerts, gl.STATIC_DRAW);

    // Deterministic floating dust flecks
    const count = 42;
    const dustData = new Float32Array(count * 5);
    let seed = 1337;
    function rand() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }
    for (let i = 0; i < count; i++) {
      dustData[i * 5 + 0] = (rand() - 0.5) * 7.2;
      dustData[i * 5 + 1] = (rand() - 0.5) * 4.4;
      dustData[i * 5 + 2] = -2.2 + rand() * 3.0;
      dustData[i * 5 + 3] = 4.0 + rand() * 14.0;
      dustData[i * 5 + 4] = rand();
    }
    this.dustCount = count;
    this.dustVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dustVbo);
    gl.bufferData(gl.ARRAY_BUFFER, dustData, gl.STATIC_DRAW);
  };

  WebGLRenderer.prototype._initSignTexture = function () {
    const gl = this.gl;
    this.signTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.signTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      2,
      2,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    );
  };

  WebGLRenderer.prototype.updateSignTexture = function (canvas, meta) {
    const gl = this.gl;
    this.texMeta = meta || this.texMeta;
    gl.bindTexture(gl.TEXTURE_2D, this.signTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);

    if (this.anisoExt) {
      const maxAniso = gl.getParameter(this.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(
        gl.TEXTURE_2D,
        this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(8, maxAniso || 4)
      );
    }
  };

  WebGLRenderer.prototype.resize = function (width, height) {
    const w = Math.max(64, Math.round(width));
    const h = Math.max(64, Math.round(height));
    if (this.width === w && this.height === h && this.fbos) return;

    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;

    const gl = this.gl;
    if (this.fbos) {
      for (const k in this.fbos) destroyFbo(gl, this.fbos[k]);
    }
    this.fbos = {
      scene: createFbo(gl, w, h),
      b1A: createFbo(gl, Math.floor(w / 2), Math.floor(h / 2)),
      b1B: createFbo(gl, Math.floor(w / 2), Math.floor(h / 2)),
      b2A: createFbo(gl, Math.floor(w / 4), Math.floor(h / 4)),
      b2B: createFbo(gl, Math.floor(w / 4), Math.floor(h / 4)),
      b3A: createFbo(gl, Math.floor(w / 8), Math.floor(h / 8)),
      b3B: createFbo(gl, Math.floor(w / 8), Math.floor(h / 8))
    };
  };

  WebGLRenderer.prototype._blurFbo = function (srcTex, tmpFbo, dstFbo, stepScale) {
    const gl = this.gl;
    gl.useProgram(this.blurProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fsVbo);
    gl.enableVertexAttribArray(this.blurLoc.aPos);
    gl.vertexAttribPointer(this.blurLoc.aPos, 2, gl.FLOAT, false, 0, 0);

    // Horizontal pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, tmpFbo.fbo);
    gl.viewport(0, 0, tmpFbo.width, tmpFbo.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(this.blurLoc.uTex, 0);
    gl.uniform2f(this.blurLoc.uDir, stepScale / tmpFbo.width, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Vertical pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo.fbo);
    gl.viewport(0, 0, dstFbo.width, dstFbo.height);
    gl.bindTexture(gl.TEXTURE_2D, tmpFbo.tex);
    gl.uniform2f(this.blurLoc.uDir, 0, stepScale / dstFbo.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.disableVertexAttribArray(this.blurLoc.aPos);
  };

  WebGLRenderer.prototype.render = function (state, phase, pointer, isExport) {
    if (!this.fbos) return;
    const gl = this.gl;
    const motion = NS.Motion.evaluateMotion(state, phase, pointer, isExport);
    const flicker = NS.Motion.evaluateFlicker(state.flicker, phase);

    const primaryRgb = hexToRgbNorm(state.primaryColor);
    const secondaryRgb = hexToRgbNorm(state.secondaryColor);
    const bgRgb = hexToRgbNorm(state.bgColor);

    const aspect = this.width / this.height;
    const fovyRad = ((state.fov || 42) * Math.PI) / 180;
    const baseHalfH = 1.95;
    const cameraDist = baseHalfH / Math.tan(fovyRad * 0.5);
    const visHalfW = baseHalfH * aspect;

    const proj = mat4Perspective(new Float32Array(16), fovyRad, aspect, 0.25, 45.0);
    const view = mat4Identity(new Float32Array(16));
    view[14] = -cameraDist;
    const vp = mat4Multiply(new Float32Array(16), proj, view);

    // Fit sign quad gracefully in viewport regardless of text length or canvas shape
    const texAspect = this.texMeta.texAspect || 2.0;
    const fillRatio = this.texMeta.contentFillRatio || 0.78;
    const fontScale = this.texMeta.fontScale || 0.6;

    const maxVisW = visHalfW * 2 * 0.68;
    const maxVisH = baseHalfH * 2 * 0.70;
    const visibleW = Math.min(maxVisW, maxVisH * texAspect);
    const quadW = Math.min(cameraDist * 1.45, (visibleW / fillRatio) * fontScale);
    const quadH = quadW / texAspect;

    // 1. Render scene into offscreen sceneFBO with additive blending
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.scene.fbo);
    gl.viewport(0, 0, this.fbos.scene.width, this.fbos.scene.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // Optional floating ambient dust flecks
    if (state.dust) {
      gl.useProgram(this.dustProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dustVbo);
      gl.enableVertexAttribArray(this.dustLoc.aPos);
      gl.enableVertexAttribArray(this.dustLoc.aSize);
      gl.enableVertexAttribArray(this.dustLoc.aSeed);
      gl.vertexAttribPointer(this.dustLoc.aPos, 3, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(this.dustLoc.aSize, 1, gl.FLOAT, false, 20, 12);
      gl.vertexAttribPointer(this.dustLoc.aSeed, 1, gl.FLOAT, false, 20, 16);
      gl.uniformMatrix4fv(this.dustLoc.uVp, false, vp);
      gl.uniform1f(this.dustLoc.uPhase, phase);
      const dustA = state.colorMode === 'rainbow' ? hslToRgb(phase, 0.9, 0.62) : primaryRgb;
      const dustB = state.colorMode === 'rainbow' ? hslToRgb(phase + 0.35, 0.9, 0.58) : secondaryRgb;
      gl.uniform3fv(this.dustLoc.uColorA, dustA);
      gl.uniform3fv(this.dustLoc.uColorB, dustB);
      gl.drawArrays(gl.POINTS, 0, this.dustCount);
      gl.disableVertexAttribArray(this.dustLoc.aPos);
      gl.disableVertexAttribArray(this.dustLoc.aSize);
      gl.disableVertexAttribArray(this.dustLoc.aSeed);
    }

    // Infinity Mirror Z-stack (back-to-front)
    gl.useProgram(this.signProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.signVbo);
    gl.enableVertexAttribArray(this.signLoc.aPos);
    gl.enableVertexAttribArray(this.signLoc.aUv);
    gl.vertexAttribPointer(this.signLoc.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(this.signLoc.aUv, 2, gl.FLOAT, false, 20, 12);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.signTex);
    gl.uniform1i(this.signLoc.uTex, 0);

    const layers = Math.max(1, Math.round(state.layers || 8));
    const spacing = state.layerSpacing !== undefined ? state.layerSpacing : 0.15;
    const decay = state.decay !== undefined ? state.decay : 0.78;
    const coreVal = (state.core !== undefined ? state.core : 0.9) * flicker;
    const isDuotone = state.colorMode === 'duotone' ? 1.0 : 0.0;
    const isRainbow = state.colorMode === 'rainbow' ? 1.0 : 0.0;

    const signMatrix = mat4FromTransform(
      motion.posX,
      motion.posY,
      motion.posZ,
      motion.rotX,
      motion.rotY,
      motion.rotZ,
      quadW * motion.scale,
      quadH * motion.scale,
      1.0
    );

    const localOffset = new Float32Array(16);
    const modelMat = new Float32Array(16);
    const mvpMat = new Float32Array(16);

    for (let k = layers - 1; k >= 0; k--) {
      mat4Identity(localOffset);
      // Offset along local -Z inside the rotated mirror box
      localOffset[14] = -k * spacing;

      // modelMat = signMatrix * localOffset
      mat4Multiply(modelMat, signMatrix, localOffset);
      mat4Multiply(mvpMat, vp, modelMat);

      const depthRatio = layers > 1 ? k / (layers - 1) : 0;
      let colA = primaryRgb;
      let colB = primaryRgb;

      if (state.colorMode === 'duotone') {
        colA = primaryRgb;
        colB = secondaryRgb;
      } else if (state.colorMode === 'depthShift') {
        const shifted = lerpRgb(primaryRgb, secondaryRgb, Math.pow(depthRatio, 0.72));
        colA = shifted;
        colB = shifted;
      } else if (state.colorMode === 'monochrome') {
        // Front is crisp primary; deeper reflections blend gently toward secondary/deep neon
        const deepTint = lerpRgb(primaryRgb, secondaryRgb, depthRatio * 0.85);
        colA = deepTint;
        colB = deepTint;
      }

      const layerAlpha =
        k === 0
          ? 0.98 * flicker * motion.intensityBoost
          : Math.pow(decay, k) * 0.62 * flicker * motion.intensityBoost;

      const layerCore = k === 0 ? coreVal : k === 1 ? coreVal * 0.14 : 0.0;

      gl.uniformMatrix4fv(this.signLoc.uMvp, false, mvpMat);
      gl.uniform3fv(this.signLoc.uColorA, colA);
      gl.uniform3fv(this.signLoc.uColorB, colB);
      gl.uniform1f(this.signLoc.uDuotone, isDuotone);
      gl.uniform1f(this.signLoc.uRainbow, isRainbow);
      gl.uniform1f(this.signLoc.uPhase, phase);
      gl.uniform1f(this.signLoc.uCoreStrength, layerCore);
      gl.uniform1f(this.signLoc.uLayerAlpha, layerAlpha);
      gl.uniform1f(this.signLoc.uLayerIndex, k);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.disableVertexAttribArray(this.signLoc.aPos);
    gl.disableVertexAttribArray(this.signLoc.aUv);
    gl.disable(gl.BLEND);

    // 2. Multi-scale GPU Gaussian Bloom Pyramid
    this._blurFbo(this.fbos.scene.tex, this.fbos.b1A, this.fbos.b1B, 1.15);
    this._blurFbo(this.fbos.b1B.tex, this.fbos.b2A, this.fbos.b2B, 1.45);
    this._blurFbo(this.fbos.b2B.tex, this.fbos.b3A, this.fbos.b3B, 1.75);
    // Extra wide pass on b3 for smooth atmospheric wall glow
    this._blurFbo(this.fbos.b3B.tex, this.fbos.b3A, this.fbos.b3B, 1.95);

    // 3. Final Composite to Default Screen Framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.compProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fsVbo);
    gl.enableVertexAttribArray(this.compLoc.aPos);
    gl.vertexAttribPointer(this.compLoc.aPos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos.scene.tex);
    gl.uniform1i(this.compLoc.uSceneTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos.b1B.tex);
    gl.uniform1i(this.compLoc.uBloom1, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos.b2B.tex);
    gl.uniform1i(this.compLoc.uBloom2, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos.b3B.tex);
    gl.uniform1i(this.compLoc.uBloom3, 3);

    gl.uniform3fv(this.compLoc.uBgColor, bgRgb);
    gl.uniform1f(
      this.compLoc.uBloomIntensity,
      (state.bloom !== undefined ? state.bloom : 1.15) * flicker
    );
    gl.uniform1f(this.compLoc.uDither, isExport ? 0.0 : 1.0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(this.compLoc.aPos);
  };

  NS.WebGLRenderer = WebGLRenderer;
})(window);
