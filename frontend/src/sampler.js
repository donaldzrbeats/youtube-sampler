export class SamplerEngine {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.buffer = null;
    this.slices = [];
  }

  setBuffer(audioBuffer) {
    this.buffer = audioBuffer;
  }

  addSlice(start, end) {
    if (!this.buffer) throw new Error("No buffer loaded");
    if (start < 0 || end > this.buffer.duration || start >= end) {
      throw new Error("Invalid slice boundaries");
    }
    const slice = {
      id: `slice_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      start,
      end
    };
    this.slices.push(slice);
    return slice;
  }

  generateRandomSlices(count = 8) {
    if (!this.buffer) throw new Error("AudioBuffer not loaded");
    this.slices = [];
    const duration = this.buffer.duration;

    for (let i = 0; i < count; i++) {
      const start = Math.random() * (duration - 0.5);
      const length = 0.5 + Math.random() * 1.5;
      const end = Math.min(start + length, duration);
      this.slices.push({ id: `slice_${i}`, start, end });
    }
    return this.slices;
  }
}