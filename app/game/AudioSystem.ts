import type { WeaponType } from "./types";

type AudioAsset = "rotor" | "cannon" | "rocket";

const AUDIO_ASSETS: Record<AudioAsset, string> = {
  rotor: "/audio/ah64-rotor-loop.mp3",
  cannon: "/audio/m230-cannon.mp3",
  rocket: "/audio/rocket-launch.mp3",
};

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers: Partial<Record<AudioAsset, AudioBuffer>> = {};
  private rotorSource: AudioBufferSourceNode | null = null;
  private rotorSampleGain: GainNode | null = null;
  private rotorFilter: BiquadFilterNode | null = null;
  private rotorLow: OscillatorNode | null = null;
  private rotorLowGain: GainNode | null = null;
  private turbine: OscillatorNode | null = null;
  private turbineGain: GainNode | null = null;

  async start(volume: number) {
    if (this.context) {
      await this.context.resume();
      return;
    }

    const context = new AudioContext({ latencyHint: "interactive" });
    this.context = context;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;

    this.master = context.createGain();
    this.master.gain.value = clamp(volume) * 0.72;
    this.master.connect(compressor).connect(context.destination);

    const loaded = await Promise.all(
      Object.entries(AUDIO_ASSETS).map(async ([asset, url]) => {
        try {
          const response = await fetch(url, { cache: "force-cache" });
          if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          return [asset as AudioAsset, buffer] as const;
        } catch {
          return null;
        }
      }),
    );
    for (const asset of loaded) {
      if (asset) this.buffers[asset[0]] = asset[1];
    }

    this.startRotorVoices();
  }

  update(rotorRpm: number, collective: number, speed: number) {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    const rpm = clamp(rotorRpm);
    const load = clamp(collective);

    this.rotorSource?.playbackRate.setTargetAtTime(
      0.82 + rpm * 0.18 + Math.min(speed, 180) * 0.00035,
      now,
      0.08,
    );
    this.rotorSampleGain?.gain.setTargetAtTime(0.105 + load * 0.15, now, 0.1);
    this.rotorFilter?.frequency.setTargetAtTime(
      2_500 + load * 3_200 + Math.min(speed, 180) * 9,
      now,
      0.12,
    );
    this.rotorLow?.frequency.setTargetAtTime(14 + rpm * 9.5, now, 0.08);
    this.rotorLowGain?.gain.setTargetAtTime(0.026 + load * 0.046, now, 0.1);
    this.turbine?.frequency.setTargetAtTime(270 + rpm * 295 + load * 42, now, 0.1);
    this.turbineGain?.gain.setTargetAtTime(0.006 + load * 0.014, now, 0.12);
  }

  shot() {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const now = context.currentTime;
    const sample = this.buffers.cannon;

    if (sample) {
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = sample;
      source.playbackRate.value = 0.76 + Math.random() * 0.12;
      filter.type = "lowpass";
      filter.frequency.value = 4_600 + Math.random() * 900;
      filter.Q.value = 0.55;
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      source.connect(filter).connect(gain).connect(master);
      source.start(now, 0, Math.min(0.21, sample.duration));
      source.stop(now + 0.22);
    } else {
      this.noiseBurst(0.095, 1_900, 0.09);
    }

    this.thump(68 + Math.random() * 7, 31, 0.11, 0.095);
  }

  impact(intensity = 0.5) {
    this.thump(62, 22, 0.27, Math.min(0.34, intensity * 0.28));
    this.noiseBurst(0.16, 520, Math.min(0.12, intensity * 0.1));
  }

  rocket(weapon: WeaponType = "hydra") {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const now = context.currentTime;
    const sample = this.buffers.rocket;

    if (sample) {
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = sample;
      source.playbackRate.value = weapon === "hellfire" ? 0.92 : 1.16;
      filter.type = "bandpass";
      filter.frequency.value = weapon === "hellfire" ? 1_250 : 1_680;
      filter.Q.value = 0.42;
      const duration = Math.min(sample.duration, weapon === "hellfire" ? 2.7 : 1.05);
      gain.gain.setValueAtTime(weapon === "hellfire" ? 0.32 : 0.23, now);
      gain.gain.setValueAtTime(weapon === "hellfire" ? 0.3 : 0.2, now + duration * 0.55);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      source.connect(filter).connect(gain).connect(master);
      source.start(now, 0, duration);
      source.stop(now + duration + 0.02);
    } else {
      this.noiseBurst(weapon === "hellfire" ? 0.7 : 0.32, 1_450, 0.15);
    }

    this.thump(78, 30, weapon === "hellfire" ? 0.34 : 0.2, 0.13);
  }

  explosion(intensity = 1) {
    const strength = clamp(intensity, 0.1, 1.8);
    this.noiseBurst(0.52, 310, Math.min(0.46, 0.25 * strength));
    this.thump(54, 19, 0.48, Math.min(0.38, 0.22 * strength));
  }

  suspend() { void this.context?.suspend(); }
  resume() { void this.context?.resume(); }

  dispose() {
    try { this.rotorSource?.stop(); } catch { /* Already stopped. */ }
    try { this.rotorLow?.stop(); } catch { /* Already stopped. */ }
    try { this.turbine?.stop(); } catch { /* Already stopped. */ }
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.buffers = {};
    this.rotorSource = null;
    this.rotorLow = null;
    this.turbine = null;
  }

  private startRotorVoices() {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;

    const rotorBuffer = this.buffers.rotor;
    if (rotorBuffer) {
      this.rotorSource = context.createBufferSource();
      this.rotorSource.buffer = rotorBuffer;
      this.rotorSource.loop = true;
      this.rotorSource.loopStart = Math.min(0.08, rotorBuffer.duration * 0.08);
      this.rotorSource.loopEnd = Math.max(
        this.rotorSource.loopStart + 0.2,
        rotorBuffer.duration - 0.09,
      );
      this.rotorFilter = context.createBiquadFilter();
      this.rotorFilter.type = "lowpass";
      this.rotorFilter.frequency.value = 4_100;
      this.rotorFilter.Q.value = 0.62;
      this.rotorSampleGain = context.createGain();
      this.rotorSampleGain.gain.value = 0.18;
      this.rotorSource
        .connect(this.rotorFilter)
        .connect(this.rotorSampleGain)
        .connect(master);
      this.rotorSource.start();
    }

    this.rotorLow = context.createOscillator();
    this.rotorLow.type = "sine";
    this.rotorLow.frequency.value = 23;
    this.rotorLowGain = context.createGain();
    this.rotorLowGain.gain.value = 0.05;
    this.rotorLow.connect(this.rotorLowGain).connect(master);
    this.rotorLow.start();

    this.turbine = context.createOscillator();
    this.turbine.type = "sine";
    this.turbine.frequency.value = 560;
    this.turbineGain = context.createGain();
    this.turbineGain.gain.value = 0.012;
    this.turbine.connect(this.turbineGain).connect(master);
    this.turbine.start();
  }

  private thump(startFrequency: number, endFrequency: number, duration: number, gainValue: number) {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(Math.max(0.001, gainValue), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  private noiseBurst(duration: number, cutoff: number, gainValue: number) {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] =
        (Math.random() * 2 - 1) * Math.pow(1 - index / Math.max(1, length - 1), 1.8);
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.7;
    gain.gain.value = gainValue;
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }
}
