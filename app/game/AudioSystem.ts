export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private rotorGain: GainNode | null = null;
  private rotorLow: OscillatorNode | null = null;
  private rotorHigh: OscillatorNode | null = null;

  async start(volume: number) {
    if (this.context) {
      await this.context.resume();
      return;
    }
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = volume * 0.42;
    this.master.connect(this.context.destination);
    this.rotorGain = this.context.createGain();
    this.rotorGain.gain.value = 0.15;
    this.rotorGain.connect(this.master);
    this.rotorLow = this.context.createOscillator();
    this.rotorLow.type = "sawtooth";
    this.rotorLow.frequency.value = 18;
    this.rotorLow.connect(this.rotorGain);
    this.rotorHigh = this.context.createOscillator();
    this.rotorHigh.type = "triangle";
    this.rotorHigh.frequency.value = 54;
    const highGain = this.context.createGain();
    highGain.gain.value = 0.16;
    this.rotorHigh.connect(highGain).connect(this.rotorGain);
    this.rotorLow.start();
    this.rotorHigh.start();
  }

  update(rotorRpm: number, collective: number, speed: number) {
    if (!this.context || !this.rotorLow || !this.rotorHigh || !this.rotorGain) return;
    const now = this.context.currentTime;
    this.rotorLow.frequency.setTargetAtTime(15 + rotorRpm * 10, now, 0.08);
    this.rotorHigh.frequency.setTargetAtTime(48 + rotorRpm * 26 + speed * 0.03, now, 0.08);
    this.rotorGain.gain.setTargetAtTime(0.09 + collective * 0.18, now, 0.12);
  }

  shot() {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(92, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(42, this.context.currentTime + 0.08);
    gain.gain.setValueAtTime(0.24, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.1);
    oscillator.connect(gain).connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.11);
  }

  impact(intensity = 0.5) {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(62, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(22, this.context.currentTime + 0.24);
    gain.gain.setValueAtTime(Math.min(0.5, intensity * 0.4), this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.26);
    oscillator.connect(gain).connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.28);
  }

  rocket() {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(74, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(24, this.context.currentTime + 0.34);
    gain.gain.setValueAtTime(0.18, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.38);
    oscillator.connect(gain).connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.4);
  }

  explosion(intensity = 1) {
    if (!this.context || !this.master) return;
    const length = Math.floor(this.context.sampleRate * 0.48);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, 2.2);
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 240;
    gain.gain.value = Math.min(0.7, 0.28 * intensity);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  suspend() { void this.context?.suspend(); }
  resume() { void this.context?.resume(); }

  dispose() {
    this.rotorLow?.stop();
    this.rotorHigh?.stop();
    void this.context?.close();
    this.context = null;
  }
}
