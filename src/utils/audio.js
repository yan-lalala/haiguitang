/**
 * 庄园哥特音效引擎 (Manor Audio Engine) - 完美落地增强版
 * 跨端支持 H5 浏览器与微信小程序 WebAudio
 * 采用专业声学合成：机械打字机撞击、审判银铃、沉重法官木槌、心跳心悸、教堂晚钟
 */

class ManorAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.unlocked = false;
  }

  /**
   * 初始化并激活 AudioContext (解决浏览器 Autoplay 拦截)
   */
  unlock() {
    try {
      if (!this.ctx) {
        let AudioCtx = null;
        if (typeof window !== 'undefined') {
          AudioCtx = window.AudioContext || window.webkitAudioContext;
        } else if (typeof wx !== 'undefined' && wx.createWebAudioContext) {
          this.ctx = wx.createWebAudioContext();
          this.unlocked = true;
          return this.ctx;
        }
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.unlocked = true;
        }).catch(() => {});
      } else if (this.ctx) {
        this.unlocked = true;
      }
    } catch (e) {
      console.warn('AudioContext unlock notice:', e);
    }
    return this.ctx;
  }

  toggleMute() {
    this.unlock();
    this.muted = !this.muted;
    return this.muted;
  }

  /**
   * 试听音效专有通道：强制解静音并依次播放打字机与大捷银铃
   */
  async playTestSound() {
    this.muted = false;
    this.unlock();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {}
    }
    // 步骤1：机械打字机双击
    this.playTypewriter();
    setTimeout(() => {
      this.playTypewriter();
    }, 120);

    // 步骤2：真相审判空灵银铃
    setTimeout(() => {
      this.playVerdict('是');
    }, 280);

    // 步骤3：庄园深沉教堂晚钟
    setTimeout(() => {
      this.playChurchBell();
    }, 600);
  }

  /**
   * 1. 机械打字机按键撞击声 (金属连杆 + 键帽触底木感)
   */
  playTypewriter() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const t = Math.max(this.ctx.currentTime || 0, 0.001) + 0.01;

      // 击键高频瞬态 (白噪声脉冲)
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.06);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2200, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.95, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(t);

      // 键帽触底机械沉闷撞击
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(360, t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.05);

      oscGain.gain.setValueAtTime(0.7, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } catch (e) {
      console.warn('Typewriter audio error:', e);
    }
  }

  /**
   * 2. 审讯判词音效
   */
  playVerdict(judgment) {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const t = Math.max(this.ctx.currentTime || 0, 0.001) + 0.01;

      if (judgment === '是') {
        // 【真】空灵银铃和弦 (C6, E6, G6, C7 高频清澈回响)
        const chord = [1046.50, 1318.51, 1567.98, 2093.00];
        chord.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);

          gain.gain.setValueAtTime(0.8 / (idx + 1), t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(t);
          osc.stop(t + 1.45);
        });
      } else if (judgment === '否') {
        // 【伪】庄园行刑木槌重击 (沉闷撞击 + 木质共鸣箱)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.28);

        gain.gain.setValueAtTime(1.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t);
        osc.stop(t + 0.32);

        // 木槌脆响瞬态
        const snap = this.ctx.createOscillator();
        const snapGain = this.ctx.createGain();
        snap.type = 'square';
        snap.frequency.setValueAtTime(520, t);
        snap.frequency.exponentialRampToValueAtTime(110, t + 0.04);
        snapGain.gain.setValueAtTime(0.6, t);
        snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        snap.connect(snapGain);
        snapGain.connect(this.ctx.destination);
        snap.start(t);
        snap.stop(t + 0.05);
      } else if (judgment === '是也不是') {
        // 【亦真亦幻】诡谲双音泛音
        [440, 466.16].forEach((freq) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.65);
        });
      } else {
        // 【无涉】虚无干燥沙沙声
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, t);
        osc.frequency.linearRampToValueAtTime(120, t + 0.15);

        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t);
        osc.stop(t + 0.18);
      }
    } catch (e) {
      console.warn('Verdict audio error:', e);
    }
  }

  /**
   * 3. 撕裂迷雾/锁链断裂 + 沉重两记心跳声 (Lub-Dub)
   */
  playClueUnlock() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const t = Math.max(this.ctx.currentTime || 0, 0.001) + 0.01;

      // 锁链金属崩裂刮擦
      const metal = this.ctx.createOscillator();
      const metalGain = this.ctx.createGain();
      metal.type = 'sawtooth';
      metal.frequency.setValueAtTime(1200, t);
      metal.frequency.exponentialRampToValueAtTime(140, t + 0.22);

      metalGain.gain.setValueAtTime(0.7, t);
      metalGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

      metal.connect(metalGain);
      metalGain.connect(this.ctx.destination);
      metal.start(t);
      metal.stop(t + 0.25);

      // 第一声重度心跳 (Lub)
      this._thump(t + 0.08, 90, 1.1);

      // 第二声心跳 (Dub)
      this._thump(t + 0.32, 75, 0.95);
    } catch (e) {
      console.warn('Clue unlock audio error:', e);
    }
  }

  _thump(time, startFreq, volume) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(26, time + 0.2);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.24);
  }

  /**
   * 4. 庄园终局教堂晚钟 (深沉悠远)
   */
  playChurchBell() {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const t = Math.max(this.ctx.currentTime || 0, 0.001) + 0.01;
      const harmonics = [146.83, 220.00, 293.66, 370.00, 440.00];

      harmonics.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.8 / (idx + 1), t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t);
        osc.stop(t + 3.9);
      });
    } catch (e) {
      console.warn('Church bell audio error:', e);
    }
  }
}

export const manorAudio = new ManorAudioEngine();
