(function (global) {
  'use strict';

  const NS = (global.NeonStudio = global.NeonStudio || {});

  const COLOR_PRESETS = [
    {
      id: 'classicMagenta',
      name: '经典玫粉',
      mode: 'monochrome',
      primary: '#ff3ec8',
      secondary: '#9d1486',
      bg: '#150818'
    },
    {
      id: 'cyberCyan',
      name: '赛博青蓝',
      mode: 'depthShift',
      primary: '#2bf6ff',
      secondary: '#1b5cff',
      bg: '#08111c'
    },
    {
      id: 'sunsetCoral',
      name: '日落珊瑚',
      mode: 'duotone',
      primary: '#ff5268',
      secondary: '#ffaa2b',
      bg: '#190a0e'
    },
    {
      id: 'electricViolet',
      name: '电光紫夜',
      mode: 'monochrome',
      primary: '#be4cff',
      secondary: '#4b17b8',
      bg: '#11081c'
    },
    {
      id: 'mintAcid',
      name: '酸性薄荷',
      mode: 'depthShift',
      primary: '#3effa8',
      secondary: '#009ad4',
      bg: '#071612'
    },
    {
      id: 'warmAmber',
      name: '复古琥珀',
      mode: 'monochrome',
      primary: '#ffbb3b',
      secondary: '#c83e10',
      bg: '#170d07'
    },
    {
      id: 'vaporwave',
      name: '蒸汽波双色',
      mode: 'duotone',
      primary: '#ff3ec8',
      secondary: '#28f0ff',
      bg: '#11091c'
    },
    {
      id: 'rainbow',
      name: '流光幻彩',
      mode: 'rainbow',
      primary: '#ff4fd8',
      secondary: '#28f0ff',
      bg: '#100a18'
    }
  ];

  const DEFAULT_STATE = {
    text: 'NEON',
    font: 'classic',
    tubeStyle: 'hollow',
    frame: 'rounded',
    fontSize: 0.6,
    letterSpacing: 0.12,
    tubeWidth: 1.0,
    framePad: 1.0,
    presetId: 'classicMagenta',
    colorMode: 'monochrome',
    primaryColor: '#ff3ec8',
    secondaryColor: '#9d1486',
    bgColor: '#150818',
    layers: 8,
    layerSpacing: 0.15,
    decay: 0.78,
    bloom: 1.15,
    core: 0.90,
    flicker: 'steady',
    dust: true,
    motion: 'swing',
    speed: 1.0,
    amplitude: 1.0,
    fov: 42
  };

  function cloneDefaults() {
    return Object.assign({}, DEFAULT_STATE);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  function init() {
    const canvas = document.getElementById('neon-canvas');
    const stage = document.getElementById('stage');
    const shell = document.getElementById('app');

    let renderer;
    try {
      renderer = new NS.WebGLRenderer(canvas);
    } catch (err) {
      document.getElementById('webgl-error').classList.remove('hidden');
      return;
    }

    const state = cloneDefaults();
    let isPlaying = true;
    let isExporting = false;
    let phase = 0;
    let lastTs = performance.now();

    const pointer = {
      hoverX: 0,
      hoverY: 0,
      dragRotX: 0,
      dragRotY: 0,
      dragging: false,
      lastX: 0,
      lastY: 0
    };

    function syncAccentColor() {
      document.documentElement.style.setProperty('--accent', state.primaryColor);
    }

    function rebuildTexture() {
      const texResult = NS.SignTexture.generateSignTexture(state);
      renderer.updateSignTexture(texResult.canvas, texResult);
    }

    function resizeStage() {
      if (isExporting) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = stage.getBoundingClientRect();
      renderer.resize(rect.width * dpr, rect.height * dpr);
    }

    // Build Color Preset Swatches
    const swatchContainer = document.getElementById('color-presets');
    COLOR_PRESETS.forEach(function (preset) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch-btn' + (preset.id === state.presetId ? ' active' : '');
      btn.dataset.presetId = preset.id;

      const dot = document.createElement('span');
      dot.className = 'swatch-dot';
      if (preset.mode === 'rainbow') {
        dot.style.background = 'conic-gradient(#ff3ec8, #ffb43b, #3effa8, #28f0ff, #be4cff, #ff3ec8)';
      } else if (preset.mode === 'duotone' || preset.mode === 'depthShift') {
        dot.style.background = `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})`;
      } else {
        dot.style.background = preset.primary;
      }
      dot.style.boxShadow = `0 0 12px ${preset.primary}88`;

      const label = document.createElement('span');
      label.textContent = preset.name;
      btn.appendChild(dot);
      btn.appendChild(label);

      btn.addEventListener('click', function () {
        applyPreset(preset);
      });
      swatchContainer.appendChild(btn);
    });

    function setGroupActive(containerId, val) {
      const el = document.getElementById(containerId);
      if (!el) return;
      const btns = el.querySelectorAll('[data-value]');
      for (let i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].dataset.value === val);
      }
    }

    function bindSegmentedGroup(containerId, stateKey, rebuildTex) {
      const el = document.getElementById(containerId);
      el.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-value]');
        if (!btn) return;
        state[stateKey] = btn.dataset.value;
        setGroupActive(containerId, state[stateKey]);
        if (stateKey === 'colorMode') {
          state.presetId = '';
          updatePresetHighlight();
        }
        if (rebuildTex) rebuildTexture();
      });
    }

    function updatePresetHighlight() {
      const btns = swatchContainer.querySelectorAll('.swatch-btn');
      for (let i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].dataset.presetId === state.presetId);
      }
    }

    function applyPreset(preset) {
      state.presetId = preset.id;
      state.colorMode = preset.mode;
      state.primaryColor = preset.primary;
      state.secondaryColor = preset.secondary;
      state.bgColor = preset.bg;
      syncInputsFromState();
      syncAccentColor();
    }

    function bindSlider(inputId, valId, stateKey, formatFn, rebuildTex) {
      const input = document.getElementById(inputId);
      const valEl = document.getElementById(valId);
      input.addEventListener('input', function () {
        state[stateKey] = parseFloat(input.value);
        valEl.textContent = formatFn(state[stateKey]);
        if (rebuildTex) rebuildTexture();
      });
    }

    function syncInputsFromState() {
      document.getElementById('input-text').value = state.text;
      setGroupActive('group-font', state.font);
      setGroupActive('group-tube-style', state.tubeStyle);
      setGroupActive('group-frame', state.frame);
      setGroupActive('group-color-mode', state.colorMode);
      setGroupActive('group-flicker', state.flicker);
      setGroupActive('group-motion', state.motion);
      updatePresetHighlight();

      document.getElementById('input-primary-color').value = state.primaryColor;
      document.getElementById('input-secondary-color').value = state.secondaryColor;
      document.getElementById('input-bg-color').value = state.bgColor;
      document.getElementById('toggle-dust').checked = state.dust;

      const sliders = [
        ['range-font-size', 'val-font-size', state.fontSize, function (v) { return v.toFixed(2) + '×'; }],
        ['range-letter-spacing', 'val-letter-spacing', state.letterSpacing, function (v) { return v.toFixed(2); }],
        ['range-tube-width', 'val-tube-width', state.tubeWidth, function (v) { return v.toFixed(2) + '×'; }],
        ['range-frame-pad', 'val-frame-pad', state.framePad, function (v) { return v.toFixed(2) + '×'; }],
        ['range-layers', 'val-layers', state.layers, function (v) { return Math.round(v) + ' 层'; }],
        ['range-layer-spacing', 'val-layer-spacing', state.layerSpacing, function (v) { return v.toFixed(2); }],
        ['range-decay', 'val-decay', state.decay, function (v) { return v.toFixed(2); }],
        ['range-bloom', 'val-bloom', state.bloom, function (v) { return v.toFixed(2); }],
        ['range-core', 'val-core', state.core, function (v) { return v.toFixed(2); }],
        ['range-speed', 'val-speed', state.speed, function (v) { return v.toFixed(2) + '×'; }],
        ['range-amplitude', 'val-amplitude', state.amplitude, function (v) { return v.toFixed(2) + '×'; }],
        ['range-fov', 'val-fov', state.fov, function (v) { return Math.round(v) + '°'; }]
      ];
      for (let i = 0; i < sliders.length; i++) {
        const s = sliders[i];
        document.getElementById(s[0]).value = s[2];
        document.getElementById(s[1]).textContent = s[3](s[2]);
      }
    }

    // Tabs switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    for (let i = 0; i < tabBtns.length; i++) {
      tabBtns[i].addEventListener('click', function () {
        const target = this.dataset.tab;
        for (let j = 0; j < tabBtns.length; j++) {
          const active = tabBtns[j].dataset.tab === target;
          tabBtns[j].classList.toggle('active', active);
          tabBtns[j].setAttribute('aria-selected', active ? 'true' : 'false');
        }
        for (let j = 0; j < tabPanels.length; j++) {
          tabPanels[j].classList.toggle('active', tabPanels[j].id === 'panel-' + target);
        }
      });
    }

    // Text input & quick phrases
    const textInput = document.getElementById('input-text');
    textInput.addEventListener('input', function () {
      state.text = textInput.value;
      rebuildTexture();
    });

    const chipBtns = document.querySelectorAll('.chip-btn');
    for (let i = 0; i < chipBtns.length; i++) {
      chipBtns[i].addEventListener('click', function () {
        state.text = this.dataset.phrase;
        textInput.value = state.text;
        rebuildTexture();
      });
    }

    // Bind segmented controls
    bindSegmentedGroup('group-font', 'font', true);
    bindSegmentedGroup('group-tube-style', 'tubeStyle', true);
    bindSegmentedGroup('group-frame', 'frame', true);
    bindSegmentedGroup('group-color-mode', 'colorMode', false);
    bindSegmentedGroup('group-flicker', 'flicker', false);
    bindSegmentedGroup('group-motion', 'motion', false);

    // Bind sliders
    bindSlider('range-font-size', 'val-font-size', 'fontSize', function (v) { return v.toFixed(2) + '×'; }, true);
    bindSlider('range-letter-spacing', 'val-letter-spacing', 'letterSpacing', function (v) { return v.toFixed(2); }, true);
    bindSlider('range-tube-width', 'val-tube-width', 'tubeWidth', function (v) { return v.toFixed(2) + '×'; }, true);
    bindSlider('range-frame-pad', 'val-frame-pad', 'framePad', function (v) { return v.toFixed(2) + '×'; }, true);
    bindSlider('range-layers', 'val-layers', 'layers', function (v) { return Math.round(v) + ' 层'; }, false);
    bindSlider('range-layer-spacing', 'val-layer-spacing', 'layerSpacing', function (v) { return v.toFixed(2); }, false);
    bindSlider('range-decay', 'val-decay', 'decay', function (v) { return v.toFixed(2); }, false);
    bindSlider('range-bloom', 'val-bloom', 'bloom', function (v) { return v.toFixed(2); }, false);
    bindSlider('range-core', 'val-core', 'core', function (v) { return v.toFixed(2); }, false);
    bindSlider('range-speed', 'val-speed', 'speed', function (v) { return v.toFixed(2) + '×'; }, false);
    bindSlider('range-amplitude', 'val-amplitude', 'amplitude', function (v) { return v.toFixed(2) + '×'; }, false);
    bindSlider('range-fov', 'val-fov', 'fov', function (v) { return Math.round(v) + '°'; }, false);

    // Color pickers
    document.getElementById('input-primary-color').addEventListener('input', function (e) {
      state.primaryColor = e.target.value;
      state.presetId = '';
      updatePresetHighlight();
      syncAccentColor();
    });
    document.getElementById('input-secondary-color').addEventListener('input', function (e) {
      state.secondaryColor = e.target.value;
      state.presetId = '';
      updatePresetHighlight();
    });
    document.getElementById('input-bg-color').addEventListener('input', function (e) {
      state.bgColor = e.target.value;
      state.presetId = '';
      updatePresetHighlight();
    });
    document.getElementById('toggle-dust').addEventListener('change', function (e) {
      state.dust = e.target.checked;
    });

    // HUD & Utility buttons
    function updatePlayUi() {
      document.getElementById('icon-pause').classList.toggle('hidden', !isPlaying);
      document.getElementById('icon-play').classList.toggle('hidden', isPlaying);
      document.getElementById('label-play-pause').textContent = isPlaying ? '暂停' : '播放';
    }

    function togglePlay() {
      isPlaying = !isPlaying;
      updatePlayUi();
    }

    function toggleZen() {
      const zen = shell.classList.toggle('zen-mode');
      document.getElementById('btn-open-panel').classList.toggle('hidden', !zen);
      document.getElementById('label-zen-mode').textContent = zen ? '展开面板' : '收起面板';
      setTimeout(resizeStage, 240);
    }

    document.getElementById('btn-play-pause').addEventListener('click', togglePlay);
    document.getElementById('btn-zen-mode').addEventListener('click', toggleZen);
    document.getElementById('btn-open-panel').addEventListener('click', toggleZen);

    document.getElementById('btn-reset').addEventListener('click', function () {
      Object.assign(state, cloneDefaults());
      pointer.dragRotX = 0;
      pointer.dragRotY = 0;
      syncInputsFromState();
      syncAccentColor();
      rebuildTexture();
    });

    document.getElementById('btn-reset-view').addEventListener('click', function () {
      pointer.dragRotX = 0;
      pointer.dragRotY = 0;
      pointer.hoverX = 0;
      pointer.hoverY = 0;
    });

    document.getElementById('btn-randomize').addEventListener('click', function () {
      const phrases = ['NEON', 'OPEN', 'CYBER', 'NIGHT', 'DREAM', '夜未眠', 'FUTURE', 'PULSE'];
      const frames = ['rounded', 'pill', 'double', 'hex', 'underline'];
      const motions = ['swing', 'figure8', 'nod', 'hover', 'pulse'];
      const tubes = ['hollow', 'solid', 'double'];
      const preset = COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)];

      state.text = phrases[Math.floor(Math.random() * phrases.length)];
      state.frame = frames[Math.floor(Math.random() * frames.length)];
      state.motion = motions[Math.floor(Math.random() * motions.length)];
      state.tubeStyle = tubes[Math.floor(Math.random() * tubes.length)];
      state.layers = 6 + Math.floor(Math.random() * 8);
      applyPreset(preset);
      rebuildTexture();
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', function (e) {
      if (document.activeElement === textInput) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'h' || e.key === 'H') {
        toggleZen();
      }
    });

    // Canvas drag / hover interaction
    canvas.addEventListener('pointerdown', function (e) {
      pointer.dragging = true;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', function (e) {
      const rect = canvas.getBoundingClientRect();
      pointer.hoverX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointer.hoverY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
      if (pointer.dragging) {
        const dx = e.clientX - pointer.lastX;
        const dy = e.clientY - pointer.lastY;
        pointer.lastX = e.clientX;
        pointer.lastY = e.clientY;
        pointer.dragRotY += dx * 0.007;
        pointer.dragRotX = Math.max(-1.1, Math.min(1.1, pointer.dragRotX + dy * 0.007));
      }
    });

    function endDrag(e) {
      if (pointer.dragging) {
        pointer.dragging = false;
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // Export PNG
    function exportPng() {
      renderer.render(state, phase, pointer, false);
      canvas.toBlob(function (blob) {
        if (!blob) return;
        const slug = (state.text || 'neon').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '_').slice(0, 18) || 'neon';
        downloadBlob(blob, `neon_${slug}.png`);
      }, 'image/png');
    }

    document.getElementById('btn-quick-png').addEventListener('click', exportPng);
    document.getElementById('btn-export-png').addEventListener('click', exportPng);

    // Export Seamless GIF
    const btnGif = document.getElementById('btn-export-gif');
    const progressWrap = document.getElementById('gif-progress-wrap');
    const progressFill = document.getElementById('gif-progress-fill');
    const progressText = document.getElementById('gif-progress-text');

    btnGif.addEventListener('click', async function () {
      if (isExporting) return;
      isExporting = true;
      btnGif.disabled = true;
      progressWrap.classList.remove('hidden');
      progressFill.style.width = '5%';
      progressText.textContent = '正在渲染无缝循环帧...';

      const sizeStr = document.getElementById('select-gif-size').value;
      const parts = sizeStr.split('x');
      const gifW = parseInt(parts[0], 10) || 500;
      const gifH = parseInt(parts[1], 10) || 300;
      const fps = parseInt(document.getElementById('select-gif-fps').value, 10) || 24;

      const periodSec = NS.Motion.getPeriodSeconds(state.speed);
      const totalFrames = Math.max(18, Math.min(90, Math.round(periodSec * fps)));
      const delayMs = Math.round((periodSec * 1000) / totalFrames);

      const capCanvas = document.createElement('canvas');
      capCanvas.width = gifW;
      capCanvas.height = gifH;
      const capCtx = capCanvas.getContext('2d', { willReadFrequently: true });
      const frames = [];

      try {
        renderer.resize(gifW, gifH);
        for (let i = 0; i < totalFrames; i++) {
          const framePhase = i / totalFrames;
          renderer.render(state, framePhase, pointer, true);
          capCtx.drawImage(canvas, 0, 0, gifW, gifH);
          frames.push(capCtx.getImageData(0, 0, gifW, gifH));
        }
      } finally {
        isExporting = false;
        resizeStage();
      }

      try {
        const blob = await NS.GifEncoder.encodeGif(frames, gifW, gifH, delayMs, function (p, msg) {
          progressFill.style.width = Math.round(p * 100) + '%';
          progressText.textContent = msg;
        });
        const slug = (state.text || 'neon').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '_').slice(0, 18) || 'neon';
        downloadBlob(blob, `neon_${slug}.gif`);
      } catch (err) {
        progressText.textContent = 'GIF 编码失败: ' + err.message;
      } finally {
        btnGif.disabled = false;
      }
    });

    // Export WebM Video
    const btnWebm = document.getElementById('btn-export-webm');
    const webmStatus = document.getElementById('webm-status-text');

    btnWebm.addEventListener('click', function () {
      if (isExporting) return;
      if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
        webmStatus.classList.remove('hidden');
        webmStatus.textContent = '当前浏览器不支持 Canvas 视频录制，请使用 GIF 或 PNG 导出。';
        return;
      }

      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ];
      let chosenMime = '';
      for (let i = 0; i < mimeTypes.length; i++) {
        if (MediaRecorder.isTypeSupported(mimeTypes[i])) {
          chosenMime = mimeTypes[i];
          break;
        }
      }
      if (!chosenMime) {
        webmStatus.classList.remove('hidden');
        webmStatus.textContent = '浏览器不支持 WebM 编码器，建议使用 GIF 导出。';
        return;
      }

      btnWebm.disabled = true;
      webmStatus.classList.remove('hidden');
      webmStatus.textContent = '正在录制 1 个完整周期...';

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, {
        mimeType: chosenMime,
        videoBitsPerSecond: 4500000
      });
      const chunks = [];
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = function () {
        const blob = new Blob(chunks, { type: chosenMime });
        const slug = (state.text || 'neon').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '_').slice(0, 18) || 'neon';
        downloadBlob(blob, `neon_${slug}.webm`);
        webmStatus.textContent = 'WebM 视频已生成并下载！';
        btnWebm.disabled = false;
      };

      const periodMs = NS.Motion.getPeriodSeconds(state.speed) * 1000;
      phase = 0;
      isPlaying = true;
      updatePlayUi();
      recorder.start();

      setTimeout(function () {
        if (recorder.state !== 'inactive') recorder.stop();
      }, Math.round(periodMs));
    });

    // Main render loop
    function tick(now) {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;

      if (!isExporting) {
        if (isPlaying) {
          const period = NS.Motion.getPeriodSeconds(state.speed);
          phase = (phase + dt / period) % 1.0;
        }
        if (!pointer.dragging && state.motion !== 'static') {
          pointer.dragRotX *= Math.pow(0.08, dt);
          pointer.dragRotY *= Math.pow(0.08, dt);
        }
        renderer.render(state, phase, pointer, false);
      }
      requestAnimationFrame(tick);
    }

    window.addEventListener('resize', resizeStage);
    syncInputsFromState();
    syncAccentColor();
    resizeStage();
    rebuildTexture();
    requestAnimationFrame(tick);
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
