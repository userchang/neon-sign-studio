(function (global) {
  'use strict';

  const NS = (global.NeonStudio = global.NeonStudio || {});
  const TAU = Math.PI * 2;
  const BASE_PERIOD_SEC = 2.4;

  function getPeriodSeconds(speed) {
    const s = Math.max(0.15, speed || 1.0);
    return BASE_PERIOD_SEC / s;
  }

  function evaluateMotion(state, phase, pointer, isExport) {
    const amp = state.amplitude !== undefined ? state.amplitude : 1.0;
    const t = phase * TAU;

    let rotX = 0;
    let rotY = 0;
    let rotZ = 0;
    let posX = 0;
    let posY = 0;
    let posZ = 0;
    let scale = 1.0;
    let intensityBoost = 1.0;

    switch (state.motion) {
      case 'figure8':
        rotY = amp * 0.46 * Math.sin(t);
        rotX = amp * 0.22 * Math.sin(t * 2.0);
        rotZ = amp * 0.08 * Math.cos(t);
        posX = amp * 0.14 * Math.sin(t);
        posY = amp * 0.09 * Math.sin(t * 2.0);
        break;

      case 'nod':
        rotX = amp * 0.36 * Math.sin(t);
        rotY = amp * 0.10 * Math.cos(t);
        posY = amp * 0.08 * Math.sin(t);
        break;

      case 'spin360':
        rotY = t;
        rotX = amp * 0.14 * Math.sin(t);
        rotZ = amp * 0.05 * Math.cos(t);
        posZ = -0.35; // keep wide signs cleanly away from near plane
        break;

      case 'hover':
        rotY = amp * (0.28 * Math.sin(t) + 0.12 * Math.cos(t * 2.0));
        rotX = amp * (0.16 * Math.cos(t) + 0.07 * Math.sin(t * 3.0));
        rotZ = amp * 0.08 * Math.sin(t + 1.0);
        posY = amp * 0.10 * Math.sin(t * 2.0);
        posZ = amp * 0.14 * Math.cos(t);
        break;

      case 'pulse': {
        const beat = Math.pow(Math.max(0, Math.sin(t * 2.0)), 4.0);
        scale = 1.0 + amp * 0.12 * beat;
        rotY = amp * 0.34 * Math.sin(t);
        rotZ = amp * 0.05 * Math.sin(t * 2.0);
        intensityBoost = 1.0 + 0.28 * beat;
        break;
      }

      case 'pointer':
        if (isExport) {
          rotY = amp * 0.42 * Math.sin(t);
          rotX = amp * 0.24 * Math.cos(t);
        } else {
          rotY = (pointer.hoverX || 0) * amp * 0.62 + 0.04 * Math.sin(t);
          rotX = -(pointer.hoverY || 0) * amp * 0.42 + 0.03 * Math.cos(t);
        }
        break;

      case 'static':
        rotY = -0.26 * amp;
        rotX = 0.05 * amp;
        break;

      case 'swing':
      default:
        // Signature horizontal infinity-mirror sway matching the reference video
        rotY = amp * 0.46 * Math.sin(t);
        rotX = amp * 0.045 * Math.sin(t * 2.0 + 0.4);
        rotZ = amp * 0.024 * Math.cos(t);
        posX = amp * 0.04 * Math.sin(t);
        break;
    }

    rotX += pointer.dragRotX || 0;
    rotY += pointer.dragRotY || 0;

    return {
      rotX: rotX,
      rotY: rotY,
      rotZ: rotZ,
      posX: posX,
      posY: posY,
      posZ: posZ,
      scale: scale,
      intensityBoost: intensityBoost
    };
  }

  function evaluateFlicker(mode, phase) {
    const t = phase * TAU;
    if (mode === 'breathe') {
      return 0.84 + 0.16 * (0.5 + 0.5 * Math.sin(t));
    }
    if (mode === 'buzz') {
      // Periodic realistic neon starter stutter
      const w1 = Math.exp(-Math.pow((phase - 0.34) / 0.035, 2));
      const w2 = Math.exp(-Math.pow((phase - 0.78) / 0.045, 2));
      const jitter = 0.5 + 0.5 * Math.sin(t * 23.0) * Math.cos(t * 17.0);
      return 1.0 - (w1 * 0.48 + w2 * 0.62) * jitter;
    }
    if (mode === 'glitch') {
      const pulseA = Math.sin(t * 13.0) > 0.82 ? 0.35 : 1.0;
      const pulseB = Math.cos(t * 29.0) > 0.88 ? 0.20 : 1.0;
      return Math.min(pulseA, pulseB);
    }
    return 1.0;
  }

  NS.Motion = {
    getPeriodSeconds: getPeriodSeconds,
    evaluateMotion: evaluateMotion,
    evaluateFlicker: evaluateFlicker
  };
})(window);
