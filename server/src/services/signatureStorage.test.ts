import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { validateSignaturePng } from './signatureStorage.js';

function png(withInk: boolean) {
  const image = new PNG({ width: 100, height: 50 });
  if (withInk) {
    for (let pixel = 0; pixel < 25; pixel += 1) image.data[pixel * 4 + 3] = 255;
  }
  return PNG.sync.write(image);
}

describe('validateSignaturePng', () => {
  it('accepts a decoded image containing ink', () => {
    expect(() => validateSignaturePng(png(true))).not.toThrow();
  });

  it('rejects malformed and empty images', () => {
    expect(() => validateSignaturePng(Buffer.from('not png'))).toThrow(
      'INVALID_PNG',
    );
    expect(() => validateSignaturePng(png(false))).toThrow('EMPTY_SIGNATURE');
  });
});
