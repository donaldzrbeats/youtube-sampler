import JSZip from 'jszip';

export class SamplerEngine {
  constructor(audioContext = {}) {
    this.ctx = audioContext;
    this.audioContext = audioContext;
    this.buffer = null;
    this.slices = [];
    this.pitchSemitones = 0;
    this.activeVoices = new Map();

    if (this.ctx && typeof this.ctx.createGain === 'function') {
      this.masterGain = this.ctx.createGain();
      if (this.ctx.destination && typeof this.masterGain.connect === 'function') {
        this.masterGain.connect(this.ctx.destination);
      }
    } else {
      this.masterGain = {
        gain: { value: 1.0 },
        connect: () => {}
      };
    }
  }

  setBuffer(audioBuffer) {
    this.buffer = audioBuffer;
  }

  loadBuffer(audioBuffer) {
    this.setBuffer(audioBuffer);
  }

  setVolume(value) {
    const clamped = Math.max(0.0, Math.min(1.0, Number(value)));
    if (this.masterGain && this.masterGain.gain) {
      this.masterGain.gain.value = clamped;
    }
    return clamped;
  }

  setPitch(semitones) {
    const clamped = Math.max(-12, Math.min(12, Number(semitones)));
    this.pitchSemitones = clamped;
    return clamped;
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

    const windowSize = Math.floor(sampleRate * 0.01);
    const hopSize = Math.floor(windowSize / 2);
    const minSilenceDuration = 0.05;

    const onsetTimes = [];
    let lastOnset = -minSilenceDuration;
    let prevEnergy = 0;

    for (let i = 0; i <= channelData.length - windowSize; i += hopSize) {
      let sumSq = 0;
      for (let j = 0; j < windowSize; j++) {
        const val = channelData[i + j];
        sumSq += val * val;
      }
      const rms = Math.sqrt(sumSq / windowSize);

      const currentTime = i / sampleRate;

      if (rms >= threshold && (rms - prevEnergy > threshold * 0.2 || prevEnergy < threshold * 0.5)) {
        if (currentTime - lastOnset >= minSilenceDuration) {
          onsetTimes.push(currentTime);
          lastOnset = currentTime;
        }
      }
      prevEnergy = rms;
    }

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

  startSlice(index) {
    if (!this.buffer) throw new Error("AudioBuffer not loaded");
    if (index < 0 || index >= this.slices.length) {
      throw new Error("Invalid slice index");
    }
    const slice = this.slices[index];

    if (this.activeVoices.has(index)) {
      this.stopSlice(index);
    }

    let source, voiceGain;
    if (this.ctx && typeof this.ctx.createBufferSource === 'function') {
      source = this.ctx.createBufferSource();
      source.buffer = this.buffer;
      if (source.detune) {
        source.detune.value = this.pitchSemitones * 100;
      }

      voiceGain = typeof this.ctx.createGain === 'function' ? this.ctx.createGain() : {
        gain: { value: 1.0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
        connect: () => {},
        disconnect: () => {}
      };

      if (typeof source.connect === 'function') {
        source.connect(voiceGain);
      }
      if (typeof voiceGain.connect === 'function') {
        voiceGain.connect(this.masterGain);
      }

      if (typeof source.start === 'function') {
        source.start(0, slice.start);
      }
    } else {
      source = {
        detune: { value: this.pitchSemitones * 100 },
        start: () => {},
        stop: () => {},
        disconnect: () => {}
      };
      voiceGain = {
        gain: {
          value: 1.0,
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {}
        },
        connect: () => {},
        disconnect: () => {}
      };
    }

    const voice = { source, gainNode: voiceGain, slice };
    this.activeVoices.set(index, voice);
    return voice;
  }

  stopSlice(index) {
    const voice = this.activeVoices.get(index);
    if (!voice) return;

    this.activeVoices.delete(index);

    const { source, gainNode } = voice;
    const now = (this.ctx && typeof this.ctx.currentTime === 'number') ? this.ctx.currentTime : 0;

    if (gainNode && gainNode.gain) {
      if (typeof gainNode.gain.setValueAtTime === 'function') {
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      }
      if (typeof gainNode.gain.linearRampToValueAtTime === 'function') {
        gainNode.gain.linearRampToValueAtTime(0, now + 0.01);
      }
    }

    if (source && typeof source.stop === 'function') {
      try {
        source.stop(now + 0.01);
      } catch (e) {
        // Source might have already stopped
      }
    }

    setTimeout(() => {
      if (source && typeof source.disconnect === 'function') {
        try { source.disconnect(); } catch (e) {}
      }
      if (gainNode && typeof gainNode.disconnect === 'function') {
        try { gainNode.disconnect(); } catch (e) {}
      }
    }, 15);
  }

  playSlice(index) {
    if (index < 0 || index >= this.slices.length) return;
    const slice = this.slices[index];
    this.startSlice(index);

    const duration = (slice.end - slice.start) * 1000;
    setTimeout(() => {
      this.stopSlice(index);
    }, duration);
  }

  encodeSliceToWav(startSec, endSec) {
    if (!this.buffer) throw new Error("AudioBuffer not loaded");

    const sampleRate = this.buffer.sampleRate;
    const numChannels = this.buffer.numberOfChannels || 1;
    const totalSamples = this.buffer.length || Math.floor(this.buffer.duration * sampleRate);

    const startSample = Math.max(0, Math.floor(startSec * sampleRate));
    const endSample = Math.min(totalSamples, Math.floor(endSec * sampleRate));
    const numSamples = Math.max(0, endSample - startSample);

    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(this.buffer.getChannelData(c));
    }

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        const sampleIndex = startSample + i;
        const sample = channels[c][sampleIndex] || 0;
        const clampedSample = Math.max(-1, Math.min(1, sample));
        const intSample = clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  async exportSlicesToZip() {
    if (!this.buffer) throw new Error("AudioBuffer not loaded");
    if (!this.slices || this.slices.length === 0) {
      throw new Error("No slices to export");
    }

    const zip = new JSZip();
    const folder = zip.folder("cloudsampler-slices");

    for (let index = 0; index < this.slices.length; index++) {
      const slice = this.slices[index];
      const wavBlob = this.encodeSliceToWav(slice.start, slice.end);
      const arrayBuffer = await wavBlob.arrayBuffer();
      const padIndex = String(index + 1).padStart(2, '0');
      folder.file(`slice_${padIndex}.wav`, arrayBuffer);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    return zipBlob;
  }
}
