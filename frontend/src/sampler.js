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

  detectTransients(threshold = 0.3) {
    if (!this.buffer) throw new Error("AudioBuffer not loaded");

    const channelData = this.buffer.getChannelData(0);
    const sampleRate = this.buffer.sampleRate;
    const duration = this.buffer.duration;

    // Window / frame parameters
    const windowSize = Math.floor(sampleRate * 0.01); // 10ms window
    const hopSize = Math.floor(windowSize / 2); // 5ms hop
    const minSilenceDuration = 0.05; // min 50ms between transient onsets to prevent clustering

    const onsetTimes = [];
    let lastOnset = -minSilenceDuration;

    let prevEnergy = 0;

    for (let i = 0; i <= channelData.length - windowSize; i += hopSize) {
      // Calculate energy (RMS) in window
      let sumSq = 0;
      for (let j = 0; j < windowSize; j++) {
        const val = channelData[i + j];
        sumSq += val * val;
      }
      const rms = Math.sqrt(sumSq / windowSize);

      const currentTime = i / sampleRate;

      // Transient condition: positive jump in energy or amplitude peak exceeding threshold
      // Or local peak where RMS > threshold
      if (rms >= threshold && (rms - prevEnergy > threshold * 0.2 || prevEnergy < threshold * 0.5)) {
        if (currentTime - lastOnset >= minSilenceDuration) {
          onsetTimes.push(currentTime);
          lastOnset = currentTime;
        }
      }
      prevEnergy = rms;
    }

    // Generate non-destructive slice intervals { id, start, end } based on detected peaks
    // If no onsets found, create one slice for the entire buffer
    const onsetPoints = [...new Set([0, ...onsetTimes])].sort((a, b) => a - b);
    this.slices = [];

    for (let k = 0; k < onsetPoints.length; k++) {
      const start = onsetPoints[k];
      const end = k < onsetPoints.length - 1 ? onsetPoints[k + 1] : duration;

      if (start < end) {
        this.slices.push({
          id: `slice_${k}_${Math.floor(Math.random() * 1000)}`,
          start,
          end
        });
      }
    }

    return this.slices;
  }
}
