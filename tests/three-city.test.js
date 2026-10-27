const assert = require('node:assert/strict');
const test = require('node:test');
const CityLayout = require('../scripts/rendering/city-layout');
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
  const stub = createThreeStub();
  let failures = 0, groundPaints = 0;
  const scene = createCityScene({ ...stub, pixelRatio: 4,
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
  return { ...stub, scene, layout, renderer: stub.renderers[0],
    failures: () => failures, groundPaints: () => groundPaints };
}

test('Three.js scene aligns with the grid and batches building geometry', async () => {
  const { scene, layout, renderer, three, groundPaints } = await createScene();
  assert.equal(scene.name, 'three');
  assert.equal(renderer.pixelRatio, 1.75, 'pixel density must be capped for mobile GPUs');
  assert.deepEqual(renderer.size, [layout.width, layout.height, false]);
  assert.deepEqual(renderer.camera.position.values, [layout.width / 2, -layout.height / 2, 800]);
  assert.deepEqual(renderer.camera.target, [layout.width / 2, -layout.height / 2, 0]);
  assert.equal(renderer.camera.right - renderer.camera.left, layout.width);
  assert.equal(renderer.camera.top - renderer.camera.bottom, layout.height);
  assert.equal(renderer.camera.projectionUpdated, true);
  const bodies = renderer.scene.children.find(mesh => mesh instanceof three.InstancedMesh && mesh.material.color === '#34434a');
  assert.equal(bodies.count, layout.buildings.length);
  for (const [i, building] of layout.buildings.entries()) {
    assert.deepEqual(bodies.matrices[i].position,
      [building.x + building.width / 2, -(building.y + building.depth / 2), building.height / 2]);
    assert.deepEqual(bodies.matrices[i].scale, [building.width - 1, building.depth - 1, building.height]);
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
