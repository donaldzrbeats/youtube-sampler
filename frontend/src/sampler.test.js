import { describe, it, expect, beforeEach } from 'vitest';
import { SamplerEngine } from './sampler.js';

describe('SamplerEngine', () => {
  let engine;
  const mockBuffer = {
    duration: 10.0,
    sampleRate: 44100,
    numberOfChannels: 2,
    getChannelData: () => new Float32Array(44100 * 10)
  };

  beforeEach(() => {
    engine = new SamplerEngine({});
    engine.setBuffer(mockBuffer);
  });

  it('should generate 8 random slices within buffer duration', () => {
    const slices = engine.generateRandomSlices(8);
    expect(slices.length).toBe(8);
    slices.forEach(slice => {
      expect(slice.start).toBeGreaterThanOrEqual(0);
      expect(slice.end).toBeLessThanOrEqual(10.0);
      expect(slice.start).toBeLessThan(slice.end);
    });
  });

  it('should throw error when adding invalid slice boundaries', () => {
    expect(() => engine.addSlice(5.0, 3.0)).toThrow("Invalid slice boundaries");
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

      // Create transient peaks at 0.5s and 1.2s
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

      // Ensure slices do not overlap or exceed total duration
      for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        expect(slice.start).toBeGreaterThanOrEqual(0);
        expect(slice.end).toBeLessThanOrEqual(duration);
        expect(slice.start).toBeLessThan(slice.end);

        if (i < slices.length - 1) {
          // Next slice starts where or after current slice ends
          expect(slices[i + 1].start).toBeGreaterThanOrEqual(slice.end);
        }
      }

      // Ensure the detected transient points are approximately around 0.5s and 1.2s
      const startTimes = slices.map(s => s.start);
      const hasPeak1 = startTimes.some(t => Math.abs(t - 0.5) < 0.05);
      const hasPeak2 = startTimes.some(t => Math.abs(t - 1.2) < 0.05);

      expect(hasPeak1).toBe(true);
      expect(hasPeak2).toBe(true);
    });
  });
});
