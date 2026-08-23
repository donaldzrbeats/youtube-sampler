import { describe, it, expect, beforeEach } from 'vitest';
import { SamplerEngine } from './sampler.js';

describe('SamplerEngine', () => {
  let engine;
  const mockBuffer = { duration: 10.0, sampleRate: 44100, numberOfChannels: 2 };

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
});