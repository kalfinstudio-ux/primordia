import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let dracoLoader: DRACOLoader | null = null;
let ktx2Loader: KTX2Loader | null = null;

function getDracoLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./draco/');
  }
  return dracoLoader;
}

function getKtx2Loader(renderer?: THREE.WebGLRenderer): KTX2Loader {
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath('./basis/');
  }
  if (renderer) ktx2Loader.detectSupport(renderer);
  return ktx2Loader;
}

/**
 * Buat GLTFLoader siap memuat aset terkompresi offline:
 * - EXT_meshopt_compression (MeshoptDecoder, sinkron & ringan)
 * - KHR_draco_mesh_compression (dekoder lokal di public/play/draco/)
 * - KHR_texture_basisu / KTX2 (transcoder lokal di public/play/basis/)
 */
export function createConfiguredGltfLoader(renderer?: THREE.WebGLRenderer): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setDRACOLoader(getDracoLoader());
  if (renderer) loader.setKTX2Loader(getKtx2Loader(renderer));
  return loader;
}
