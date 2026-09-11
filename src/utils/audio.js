/**
 * 庄园哥特音效引擎 (Manor Audio Engine)
 * 基于 Web Audio API 程序化纯算法合成，零外部资源依赖，极低体积，毫秒级响应
 * 包含：打字机机械敲击、火漆裁决印章声、【真】银铃、【伪】木槌、线索破案心跳轰鸣、庄园晚钟
 */

class ManorAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.initialized = true;
      }
    } catch (e) {
      console.warn('当前环境不支持 Web Audio API');
    }
  }

  ensureContext() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  /**
   * 1. 打字机机械按键声 (敲击键盘/发问)
   */
  playTypewriter() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    
    // 瞬态机械敲击声 (Noise burst + Highpass)
    const bufferSize = this.ctx.sampleRate * 0.03;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400 + Math.random() * 300, t);
    filter.Q.setValueAtTime(3, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(t);
  }

  /**
   * 2. 火漆判决声
   * @param {string} judgment '是' | '否' | '无关' | '是也不是'
   */
  playVerdict(judgment) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    if (judgment === '是') {
      // 清脆悠远的古银钟鸣 (两重泛音共鸣)
      [587.33, 880, 1174.66].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.2 / (idx + 1), t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t);
        osc.stop(t + 1.2);
      });
    } else if (judgment === '否') {
      // 沉闷的刑架木槌轰鸣 (低频下潜撞击)
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.35);

      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.4);
    } else {
      // 迷雾沙沙声 (虚无感)
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.linearRampToValueAtTime(180, t + 0.25);

      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  /**
   * 3. 破案爽点高潮：锁链崩断 + 两记胸腔重度心跳声 (Lub-Dub)
   */
  playClueUnlock() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 锁链崩断金属高频刮擦
    const metalOsc = this.ctx.createOscillator();
    const metalGain = this.ctx.createGain();
    metalOsc.type = 'sawtooth';
    metalOsc.frequency.setValueAtTime(800, t);
    metalOsc.frequency.exponentialRampToValueAtTime(220, t + 0.15);

    metalGain.gain.setValueAtTime(0.3, t);
    metalGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    metalOsc.connect(metalGain);
    metalGain.connect(this.ctx.destination);
    metalOsc.start(t);
    metalOsc.stop(t + 0.2);

    // 第一声心跳 (Lub)
    this._triggerHeartbeat(t + 0.08, 65, 0.55);

    // 第二声心跳 (Dub)
    this._triggerHeartbeat(t + 0.26, 52, 0.45);
  }

  _triggerHeartbeat(time, startFreq, volume) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.14);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  /**
   * 4. 终局大捷：庄园教堂古钟深沉长鸣 (Church Bell)
   */
  playChurchBell() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // 经典的钟声音频物理谐波：主基频 + 多个非整数泛音
    const bellHarmonics = [220, 442, 594, 885];

    bellHarmonics.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.35 / (idx * 0.8 + 1), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 3.0);
    });
  }
}

export const manorAudio = new ManorAudioEngine();
