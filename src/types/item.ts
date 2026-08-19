import type { FaceName } from './minecraft';

/** One cuboid piece of a block model, in 0-16 model space (matches a 16x16 texture 1:1). */
export interface BlockModelElement {
  from: [number, number, number];
  to: [number, number, number];
  /** Only faces with an explicit UV rect are supported (see parseBlockModel.ts). */
  faces: Partial<Record<FaceName, { uv: [number, number, number, number]; texture: string }>>;
}

/** A self-contained block model (no `parent` chain) — see parseBlockModel.ts for scope. */
export interface BlockModel {
  textures: Record<string, string>;
  elements: BlockModelElement[];
}
