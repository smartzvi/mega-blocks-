import { describe, expect, it } from 'vitest';
import { parseBlockModel } from './parseBlockModel';

// A trimmed-down version of vanilla's real assets/minecraft/models/block/torch.json.
const TORCH_LIKE_MODEL = {
  textures: { torch: 'block/torch', particle: 'block/torch' },
  elements: [
    {
      from: [7, 0, 7],
      to: [9, 10, 9],
      faces: {
        down: { uv: [7, 13, 9, 15], texture: '#torch' },
        up: { uv: [7, 6, 9, 8], texture: '#torch' },
        north: { uv: [7, 6, 9, 16], texture: '#torch' },
        south: { uv: [7, 6, 9, 16], texture: '#torch' },
        west: { uv: [7, 6, 9, 16], texture: '#torch' },
        east: { uv: [7, 6, 9, 16], texture: '#torch' },
      },
    },
  ],
};

describe('parseBlockModel', () => {
  it('parses elements and remaps up/down to top/bottom', () => {
    const model = parseBlockModel(TORCH_LIKE_MODEL);
    expect(model.elements).toHaveLength(1);
    const [el] = model.elements;
    expect(el.from).toEqual([7, 0, 7]);
    expect(el.to).toEqual([9, 10, 9]);
    expect(el.faces.top).toEqual({ uv: [7, 6, 9, 8], texture: '#torch' });
    expect(el.faces.bottom).toEqual({ uv: [7, 13, 9, 15], texture: '#torch' });
    expect(el.faces.north).toEqual({ uv: [7, 6, 9, 16], texture: '#torch' });
    expect(model.textures.torch).toBe('block/torch');
  });

  it('auto-generates a uv rect from the element bounds when uv is omitted, like cauldron.json does', () => {
    const model = parseBlockModel({
      elements: [
        {
          from: [2, 3, 0],
          to: [14, 16, 2],
          faces: { up: { texture: '#top' }, north: { texture: '#side', cullface: 'north' } }, // no uv on either
        },
      ],
    });
    // top: uAxis=x, vAxis=z -> [from.x, from.z, to.x, to.z]
    expect(model.elements[0].faces.top).toEqual({ uv: [2, 0, 14, 2], texture: '#top' });
    // north: uAxis=x, vAxis=y -> [from.x, from.y, to.x, to.y]
    expect(model.elements[0].faces.north).toEqual({ uv: [2, 3, 14, 16], texture: '#side' });
  });

  it('throws a clear error for a parent-only model with no local elements', () => {
    expect(() => parseBlockModel({ parent: 'block/cube_all' })).toThrow(/parent/i);
  });

  it('throws for a model with neither parent nor elements', () => {
    expect(() => parseBlockModel({})).toThrow(/elements/i);
  });
});
