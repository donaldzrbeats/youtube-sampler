import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SamplerEngine } from './sampler.js';

describe('SamplerEngine', () => {
  let engine;
  let mockAudioContext;
  let mockBuffer;

  beforeEach(() => {
    const channelData = new Float32Array(44100 * 2);
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = Math.sin(i * 0.01);
    }

    mockBuffer = {
      duration: 2.0,
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 88200,
      getChannelData: vi.fn().mockReturnValue(channelData)
    };

    const mockSourceNode = {
      buffer: null,
      detune: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    };

    const mockGainNode = {
      gain: {
        value: 1.0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn()
      },
      connect: vi.fn(),
      disconnect: vi.fn()
    };

    mockAudioContext = {
      currentTime: 0,
      destination: {},
      createGain: vi.fn().mockReturnValue(mockGainNode),
      createBufferSource: vi.fn().mockReturnValue(mockSourceNode)
    };

    engine = new SamplerEngine(mockAudioContext);
    engine.setBuffer(mockBuffer);
  });

  it('should generate 8 random slices within buffer duration', () => {
    const slices = engine.generateRandomSlices(8);
    expect(slices.length).toBe(8);
    slices.forEach(slice => {
      expect(slice.start).toBeGreaterThanOrEqual(0);
      expect(slice.end).toBeLessThanOrEqual(2.0);
      expect(slice.start).toBeLessThan(slice.end);
    });
  });

  it('should throw error when adding invalid slice boundaries', () => {
    expect(() => engine.addSlice(5.0, 3.0)).toThrow("Invalid slice boundaries");
  });

  describe('setVolume', () => {
    it('should set masterGain volume and clamp within range [0.0, 1.0]', () => {
      expect(engine.setVolume(0.5)).toBe(0.5);
      expect(engine.masterGain.gain.value).toBe(0.5);

      expect(engine.setVolume(1.5)).toBe(1.0);
      expect(engine.masterGain.gain.value).toBe(1.0);

      expect(engine.setVolume(-0.2)).toBe(0.0);
      expect(engine.masterGain.gain.value).toBe(0.0);
    });
  });

  describe('setPitch', () => {
    it('should set pitchSemitones and clamp within range [-12, +12]', () => {
      expect(engine.setPitch(5)).toBe(5);
      expect(engine.pitchSemitones).toBe(5);

      expect(engine.setPitch(15)).toBe(12);
      expect(engine.pitchSemitones).toBe(12);

      expect(engine.setPitch(-20)).toBe(-12);
      expect(engine.pitchSemitones).toBe(-12);
    });
  });

  describe('startSlice and stopSlice', () => {
    it('should throw error for invalid slice index or missing buffer', () => {
      const emptyEngine = new SamplerEngine({});
      expect(() => emptyEngine.startSlice(0)).toThrow("AudioBuffer not loaded");

      expect(() => engine.startSlice(-1)).toThrow("Invalid slice index");
      expect(() => engine.startSlice(5)).toThrow("Invalid slice index");
    });

    it('should create voice node, set detune, connect to masterGain and start playback', () => {
      engine.addSlice(0.1, 0.9);
      engine.setPitch(3);

      const voice = engine.startSlice(0);
      expect(voice).toBeDefined();
      expect(voice.source.detune.value).toBe(300);
      expect(voice.source.start).toHaveBeenCalledWith(0, 0.1);
      expect(engine.activeVoices.has(0)).toBe(true);
    });

    it('should ramp down gain and stop voice on stopSlice', () => {
      engine.addSlice(0.1, 0.9);
      const voice = engine.startSlice(0);

      engine.stopSlice(0);

      expect(voice.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(1.0, 0);
      expect(voice.gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 0.01);
      expect(voice.source.stop).toHaveBeenCalledWith(0.01);
      expect(engine.activeVoices.has(0)).toBe(false);
    });
  });

  describe('encodeSliceToWav', () => {
    it('should throw error if buffer is not loaded', () => {
      const emptyEngine = new SamplerEngine({});
      expect(() => emptyEngine.encodeSliceToWav(0, 1)).toThrow("AudioBuffer not loaded");
    });

    it('should encode slice into a valid WAV Blob of non-zero size', async () => {
      const blob = engine.encodeSliceToWav(0.0, 1.0);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/wav');
      expect(blob.size).toBeGreaterThan(44);

      const buffer = await blob.arrayBuffer();
      const view = new DataView(buffer);
      const header = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      expect(header).toBe('RIFF');
      const waveStr = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
      expect(waveStr).toBe('WAVE');
    });
  });

  describe('exportSlicesToZip', () => {
    it('should throw error if buffer not loaded or no slices exist', async () => {
      const emptyEngine = new SamplerEngine({});
      await expect(emptyEngine.exportSlicesToZip()).rejects.toThrow("AudioBuffer not loaded");

      engine.slices = [];
      await expect(engine.exportSlicesToZip()).rejects.toThrow("No slices to export");
    });

    it('should generate a valid ZIP Blob containing encoded slice WAV files', async () => {
      engine.addSlice(0.0, 0.5);
      engine.addSlice(0.5, 1.0);

      const zipBlob = await engine.exportSlicesToZip();
      expect(zipBlob).toBeInstanceOf(Blob);
      expect(zipBlob.size).toBeGreaterThan(0);
    });
  });

  describe('detectTransients', () => {
    it('should throw error if buffer is not loaded', () => {
      const emptyEngine = new SamplerEngine({});
      expect(() => emptyEngine.detectTransients()).toThrow("AudioBuffer not loaded");
    });

    it('should return valid slice objects within buffer bounds for silent buffer', () => {
      const slices = engine.detectTransients();
      expect(Array.isArray(slices)).toBe(true);
      expect(slices.length).toBeGreaterThan(0);
      slices.forEach(slice => {
        expect(slice).toHaveProperty('id');
        expect(slice).toHaveProperty('start');
        expect(slice).toHaveProperty('end');
        expect(slice.start).toBeGreaterThanOrEqual(0);
        expect(slice.end).toBeLessThanOrEqual(mockBuffer.duration);
        expect(slice.start).toBeLessThan(slice.end);
      });
    });

    it('should detect transients when amplitude peaks exceed threshold and ensure non-overlapping slices', () => {
      const sampleRate = 44100;
      const duration = 2.0;
      const length = sampleRate * duration;
      const pcmData = new Float32Array(length);

      const peak1Index = Math.floor(sampleRate * 0.5);
      const peak2Index = Math.floor(sampleRate * 1.2);

      for (let i = 0; i < 500; i++) {
        pcmData[peak1Index + i] = 0.8;
        pcmData[peak2Index + i] = 0.9;
      }

      const bufferWithTransients = {
        duration: duration,
        sampleRate: sampleRate,
        numberOfChannels: 1,
        getChannelData: (channel) => pcmData
      };

      engine.setBuffer(bufferWithTransients);
      const slices = engine.detectTransients(0.3);

      expect(slices.length).toBeGreaterThan(1);

      for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        expect(slice.start).toBeGreaterThanOrEqual(0);
        expect(slice.end).toBeLessThanOrEqual(duration);
        expect(slice.start).toBeLessThan(slice.end);

        if (i < slices.length - 1) {
          expect(slices[i + 1].start).toBeGreaterThanOrEqual(slice.end);
        }
      }

      const startTimes = slices.map(s => s.start);
      const hasPeak1 = startTimes.some(t => Math.abs(t - 0.5) < 0.05);
      const hasPeak2 = startTimes.some(t => Math.abs(t - 1.2) < 0.05);

      expect(hasPeak1).toBe(true);
      expect(hasPeak2).toBe(true);
    });
  });
});
