const assert = require('node:assert/strict');
const test = require('node:test');
const CityArchitecture = require('../scripts/rendering/city-architecture');
const CityLayout = require('../scripts/rendering/city-layout');
const CityView = require('../scripts/rendering/city-view');
const { createThreeStub } = require('./helpers/three-stub');

test('vendored Three.js loads locally with the GPU scene API', async () => {
  const three = await import('../scripts/vendor/three.module.min.mjs');
  assert.equal(three.REVISION, '160');
  for (const name of ['WebGLRenderer', 'Scene', 'OrthographicCamera', 'InstancedMesh', 'CanvasTexture', 'MeshStandardMaterial']) {
    assert.equal(typeof three[name], 'function', `${name} must be bundled locally`);
  }
});

async function createScene() {
  const { createCityScene } = await import('../scripts/rendering/city-three.mjs');
  const { OrthographicCamera, Vector3 } = await import('../scripts/vendor/three.module.min.mjs');
  const stub = createThreeStub(OrthographicCamera);
  let failures = 0, groundPaints = 0;
  const scene = createCityScene({ ...stub, architecture: CityArchitecture, pixelRatio: 4,
    paintGround() { groundPaints++; }, onFailure() { failures++; } });
  const layout = CityLayout.create([
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 3, 2, 2, 2, 2, 3, 0],
    [0, 2, 0, 0, 0, 0, 2, 0],
    [0, 2, 0, 0, 0, 0, 2, 0],
    [0, 2, 2, 2, 2, 2, 2, 0],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ], 16);
  scene.setLayout(layout);
  return { ...stub, scene, layout, Vector3, renderer: stub.renderers[0],
    failures: () => failures, groundPaints: () => groundPaints };
}

test('the Three.js camera matches projected Canvas positions on the street and above it', async () => {
  const { scene, layout, renderer, Vector3 } = await createScene();
  const { width, height, view } = layout;
  const { camera } = renderer;
  camera.updateMatrixWorld();
  assert.deepEqual(camera.position.toArray(), view.camera.position);
  for (const [x, y, z] of [[0, 0, 0], [width, 0, 0], [0, height, 0], [width, height, 0],
    [24, 40, view.spriteHeight], [72, 40, layout.tile], [0, height, -layout.tile * 0.68]]) {
    const ndc = new Vector3(x, -y, z).project(camera);
    const actual = [(ndc.x + 1) * view.width / 2, (1 - ndc.y) * view.height / 2];
    const expected = CityView.project(view, x, y, z);
    assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 1e-9);
  }
  scene.dispose();
});

test('Three.js batches the shared city geometry and caches the ground and shadows', async () => {
  const { scene, layout, renderer, three, groundPaints } = await createScene();
  assert.equal(scene.name, 'three');
  assert.equal(renderer.pixelRatio, 1.75, 'pixel density must be capped for mobile GPUs');
  assert.deepEqual(renderer.size, [layout.view.width, layout.view.height, false]);
  const parts = CityArchitecture.platform(layout).concat(layout.buildings.flatMap(block =>
    CityArchitecture.building(block, layout.tile)));
  for (const [key, material] of Object.entries(CityArchitecture.materials)) {
    const expected = parts.filter(part => part.material === key);
    const batch = renderer.scene.children.find(mesh => mesh instanceof three.InstancedMesh &&
      mesh.material.color === material.color);
    assert.equal(batch?.count || 0, expected.length);
    expected.forEach(({ x, y, z, width, depth, height }, index) => {
      assert.deepEqual(batch.matrices[index].position, [x + width / 2, -(y + depth / 2), z + height / 2]);
      assert.deepEqual(batch.matrices[index].scale, [width, depth, height]);
    });
  }
  const lights = renderer.scene.children.filter(child => child instanceof three.PointLight && child.color === '#ffbd70');
  assert.ok(lights.length <= 3 && lights.length > 0, 'streetlights must use a fixed GPU light budget');
  assert.equal(groundPaints(), 1);
  scene.draw(null, { time: 5, reducedMotion: true });
  assert.equal(groundPaints(), 1, 'ground textures must not be repainted every frame');
  assert.equal(renderer.shadowMap.autoUpdate, false, 'static shadows are cached');
  scene.dispose();
});

test('Three.js releases textures, geometry and instancing buffers on rebuild and disposal', async () => {
  const { scene, layout, resources, renderer, groundPaints } = await createScene();
  const oldResources = resources.filter(resource => resource !== renderer.renderLists);
  scene.setLayout(layout);
  assert.ok(oldResources.every(resource => resource.disposals === 1));
  assert.equal(groundPaints(), 2);
  const currentResources = resources.filter(resource => resource !== renderer.renderLists && !oldResources.includes(resource));
  scene.dispose();
  scene.dispose();
  assert.ok(currentResources.every(resource => resource.disposals === 1));
  assert.equal(renderer.disposals, 1);
  assert.equal(renderer.domElement.parentNode, null);
  assert.equal(renderer.domElement.listeners.has('webglcontextlost'), false);
  assert.throws(() => scene.setLayout(layout), /disposed/);
});

test('Three.js reports context loss and refuses to render a lost or disposed context', async () => {
  const { scene, renderer, failures } = await createScene();
  let prevented = false;
  renderer.domElement.listeners.get('webglcontextlost')({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(failures(), 1);
  renderer.lost = true;
  assert.throws(() => scene.draw(null, { time: 0, reducedMotion: false }), /context unavailable/);
  scene.dispose();
  assert.throws(() => scene.draw(null, { time: 0, reducedMotion: false }), /context unavailable/);
});

test('the fixed WebGL scene only redraws when its lighting changes', async () => {
  const { scene, renderer, layout } = await createScene();
  const initial = renderer.frames;
  const frame = { time: 0, reducedMotion: false };
  scene.draw(null, frame);
  scene.draw(null, { ...frame, time: 1, view: { left: -190, top: 12, scale: 1.5 } });
  assert.equal(renderer.frames, initial, 'the WebGL city is reused across foreground frames');
  assert.equal(renderer.domElement.style.transform, 'translate(-190px, 12px) scale(1.5)');
  const lampLevels = layout.lamps.map((_, index) => index === 0 ? 0.6 : 1);
  scene.draw(null, { ...frame, reducedMotion: true, lampLevels });
  scene.draw(null, { ...frame, time: 2, reducedMotion: true, lampLevels: lampLevels.slice() });
  assert.equal(renderer.frames, initial + 1, 'an unchanged reduced-motion glitch reuses the dimmed scene');
  scene.draw(null, { ...frame, reducedMotion: true });
  assert.equal(renderer.frames, initial + 2, 'the original brightness returns when the glitch ends');
  scene.dispose();
});

test('glitch dimming affects individual GPU lanterns, halos, pools and point lights without rebuilding the scene', async () => {
  const { scene, renderer, layout, three, resources } = await createScene();
  const meshes = renderer.scene.children.filter(mesh => mesh instanceof three.InstancedMesh && mesh.instanceColor);
  const lights = renderer.scene.children.filter(child => child instanceof three.PointLight && child.color === '#ffbd70');
  assert.equal(meshes.length, 3, 'the cores and both halo layers share per-lamp dimming');
  const resourceCount = resources.length;
  const lampLevels = layout.lamps.map((_, index) => index === 0 ? 0.3 : index === 2 ? 0.65 : 1);
  scene.draw(null, { time: 0, reducedMotion: true, lampLevels });
  for (const mesh of meshes) {
    assert.deepEqual(mesh.instanceColor.colors, lampLevels.map(level => [level, level, level]));
    assert.equal(mesh.instanceColor.needsUpdate, true);
  }
  lights.forEach((light, index) => assert.equal(light.intensity, 120 * lampLevels[index]));
  const lanterns = meshes.find(mesh => mesh.material.emissive === '#ffc375');
  const shader = { fragmentShader: '#include <emissivemap_fragment>' };
  lanterns.material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /#ifdef USE_COLOR\s+totalEmissiveRadiance/,
    'Three r160 enables USE_COLOR, not USE_INSTANCING_COLOR, in fragment shaders');
  assert.match(shader.fragmentShader, /totalEmissiveRadiance \*= vColor/);
  scene.draw(null, { time: 0, reducedMotion: true });
  for (const mesh of meshes) assert.deepEqual(mesh.instanceColor.colors, layout.lamps.map(() => [1, 1, 1]));
  lights.forEach(light => assert.equal(light.intensity, 120));
  assert.equal(resources.length, resourceCount, 'the effect must not allocate GPU resources every frame');
  scene.dispose();
});
