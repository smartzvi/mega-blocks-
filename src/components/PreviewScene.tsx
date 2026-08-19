import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useAppState } from '../state/AppContext';
import { useFinalVoxelGrid } from '../state/useFinalVoxelGrid';
import { useFinalPalette } from '../state/useFinalPalette';
import { VoxelMesh } from './VoxelMesh';

export function PreviewScene() {
  const state = useAppState();
  const voxelGrid = useFinalVoxelGrid();
  const palette = useFinalPalette();

  if (!voxelGrid || !palette) return null;

  // The base camera position was tuned for a 16-cube; scale it so a 32/64-cube (or any future
  // size) is framed the same way instead of overflowing the viewport or sitting too close. Uses
  // the largest dimension so a non-cubic structure (a 2-block-tall door, a 2-block-long bed)
  // still fits entirely in frame rather than being scaled only for one axis.
  const scale = Math.max(voxelGrid.sizeX, voxelGrid.sizeY, voxelGrid.sizeZ) / 16;
  // Every hand-authored mob is built with its anatomical front (head, eyes) at the low end of its
  // own Z range — real Minecraft-compass "north" — but this +Z camera corner can only ever see
  // the opposite (+Z, "south") side of anything, since a face's own outward normal has to have a
  // positive dot product with the direction to the camera to be visible at all. For a block or
  // item that has no "front" this never mattered; for a mob, it means the default view showed the
  // animal's rear/tail end, with the head barely peeking out the far side — not a geometry bug,
  // a camera-facing mismatch (confirmed:
  // real per-mob voxel data was already correct and unchanged across several rounds of investigating
  // this as if it were one). Flipping to a -Z camera corner for mobs mode looks at the front instead.
  const cameraZ = state.mode === 'mobs' ? -24 * scale : 24 * scale;
  const cameraPosition: [number, number, number] = [24 * scale, 20 * scale, cameraZ];

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-[0_0_50px_-12px_rgba(16,185,129,0.15)]">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">3D Preview</span>
        <span className="text-xs text-slate-600">drag to rotate · scroll to zoom</span>
      </div>
      <div className="h-[480px] w-full bg-gradient-to-b from-slate-900 to-slate-950">
        <Canvas>
          <PerspectiveCamera makeDefault position={cameraPosition} fov={45} onUpdate={(c) => c.lookAt(0, 0, 0)} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 10]} intensity={1.2} />
          <directionalLight position={[-10, -10, -10]} intensity={0.3} />
          <VoxelMesh grid={voxelGrid} palette={palette} />
          <OrbitControls enableDamping target={[0, 0, 0]} />
        </Canvas>
      </div>
    </div>
  );
}
