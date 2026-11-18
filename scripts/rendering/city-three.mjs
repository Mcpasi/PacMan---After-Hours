// The Three.js dependency is injected so scene construction can also be tested without a GPU.
export function createCityScene({ three: THREE, canvas, architecture, paintGround, onFailure,
  document: dom = globalThis.document, pixelRatio = globalThis.devicePixelRatio || 1 }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(Math.max(pixelRatio, 1.5), 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.className = 'city-scene';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera();
  const resources = new Set();
  let disposed = false, localLights = [], layerTransform;
  let lampMeshes = [], lampLevels = [];
  const lampTint = new THREE.Color();
  const own = resource => { resources.add(resource); return resource; };

  function clearScene() {
    scene.clear();
    for (const resource of resources) resource.dispose();
    resources.clear();
    localLights = [];
    lampMeshes = [];
    lampLevels = [];
    renderer.renderLists.dispose();
  }

  function contextLost(event) {
    event.preventDefault();
    onFailure();
  }
  renderer.domElement.addEventListener('webglcontextlost', contextLost);

  function textureFrom(paint, width, height) {
    const surface = dom.createElement('canvas');
    surface.width = width;
    surface.height = height;
    paint(surface.getContext('2d'));
    const texture = own(new THREE.CanvasTexture(surface));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  function setLayout(layout) {
    if (disposed) throw new Error('The city scene was disposed.');
    clearScene();
    const { width, height, tile, view } = layout;
    renderer.setSize(view.width, view.height, false);
    renderer.domElement.style.width = `${view.width}px`;
    renderer.domElement.style.height = `${view.height}px`;
    camera.right = view.width / 2;
    camera.left = -camera.right;
    camera.top = view.height / 2;
    camera.bottom = -camera.top;
    camera.near = tile * 0.05;
    camera.far = view.camera.far;
    camera.up.set(0, 0, 1);
    camera.position.set(...view.camera.position);
    camera.lookAt(...view.camera.target);
    camera.updateProjectionMatrix();

    scene.add(new THREE.HemisphereLight('#b6d2dc', '#32404c', 1.45));
    const moon = new THREE.DirectionalLight('#adc7de', 1.9);
    moon.position.set(width / 2 - 100, -height / 2 + 140, 260);
    moon.target.position.set(width / 2, -height / 2, 0);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -width;
    moon.shadow.camera.right = width;
    moon.shadow.camera.top = height;
    moon.shadow.camera.bottom = -height;
    moon.shadow.camera.far = 1000;
    moon.shadow.normalBias = 0.6;
    own(moon.shadow);
    scene.add(moon, moon.target);

    const box = own(new THREE.BoxGeometry(1, 1, 1));
    const plane = own(new THREE.PlaneGeometry(1, 1));
    const transform = new THREE.Object3D();
    function instances(geometry, material, specs, shadows = false) {
      if (!specs.length) return;
      const mesh = own(new THREE.InstancedMesh(geometry, material, specs.length));
      specs.forEach((spec, index) => {
        transform.position.set(spec.x, -spec.y, spec.z);
        transform.scale.set(spec.width, spec.depth, spec.height || 1);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      scene.add(mesh);
      return mesh;
    }
    const batches = new Map();
    const parts = [...architecture.platform(layout), ...layout.buildings.flatMap(building => architecture.building(building, tile))];
    for (const { material, x, y, z, width, depth, height } of parts) {
      if (!batches.has(material)) batches.set(material, []);
      batches.get(material).push({ x: x + width / 2, y: y + depth / 2, z: z + height / 2, width, depth, height });
    }
    for (const [material, specs] of batches) {
      const finish = architecture.materials[material];
      instances(box, own(new THREE.MeshStandardMaterial(finish)), specs, !finish.emissive);
    }

    const groundTexture = textureFrom(ctx => { ctx.scale(2, 2); paintGround(ctx, layout); }, width * 2, height * 2);
    const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(width, height)),
      own(new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.62, metalness: 0.14 })));
    ground.position.set(width / 2, -height / 2, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    const glow = textureFrom(ctx => {
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255, 199, 108, 0.75)');
      gradient.addColorStop(0.25, 'rgba(243, 172, 77, 0.28)');
      gradient.addColorStop(1, 'rgba(223, 135, 52, 0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    }, 128, 128);
    const glowMaterial = own(new THREE.MeshBasicMaterial({ map: glow, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.85 }));
    const lanternMaterial = own(new THREE.MeshStandardMaterial({ color: '#ffe6ad', emissive: '#ffc375', emissiveIntensity: 2 }));
    // Standard instancing tints diffuse color only; the glowing core must dim too.
    lanternMaterial.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #ifdef USE_COLOR
          totalEmissiveRadiance *= vColor;
        #endif`);
    };
    const posts = [], lanterns = [], caps = [], pools = [];
    const z = tile * architecture.lanternHeight;
    layout.lamps.forEach((lamp, i) => {
      posts.push({ x: lamp.x, y: lamp.y, z: z / 2, width: 1.2, depth: 1.2, height: z });
      lanterns.push({ x: lamp.x, y: lamp.y, z, width: 3, depth: 3, height: 4 });
      caps.push({ x: lamp.x, y: lamp.y, z: z + 2.5, width: 4.5, depth: 4.5, height: 0.7 });
      pools.push({ x: lamp.x, y: lamp.y, z: 0.1, width: tile * 4.5, depth: tile * 4.5 });
      // A fixed light budget avoids a shader/light for every streetlamp on mobile GPUs.
      if (i < 3) {
        const light = new THREE.PointLight('#ffbd70', 120, tile * 5, 1.4);
        light.position.set(lamp.x, -lamp.y, z + 3);
        localLights.push(light);
        scene.add(light);
      }
    });
    const trim = own(new THREE.MeshStandardMaterial(architecture.materials.coping));
    instances(box, trim, posts, true);
    lampMeshes.push(instances(box, lanternMaterial, lanterns));
    instances(box, trim, caps, true);
    lampMeshes.push(instances(plane, glowMaterial, pools));
    // A smaller halo above the cap marks the lamp itself separately from its pool.
    lampMeshes.push(instances(plane, glowMaterial, layout.lamps.map(lamp => ({ x: lamp.x, y: lamp.y,
      z: z + 3, width: 13, depth: 13 }))));
    updateLampLevels(null);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    if (!renderer.domElement.parentNode) canvas.parentNode.insertBefore(renderer.domElement, canvas);
  }

  function updateLampLevels(levels) {
    let changed = false;
    for (let index = 0; index < (lampMeshes[0]?.count ?? 0); index++) {
      const level = levels?.[index] ?? 1;
      if (lampLevels[index] === level) continue;
      lampLevels[index] = level;
      const tint = lampTint.setRGB(level, level, level);
      for (const mesh of lampMeshes) mesh.setColorAt(index, tint);
      changed = true;
    }
    if (changed) {
      for (const mesh of lampMeshes) mesh.instanceColor.needsUpdate = true;
    }
    return changed;
  }

  return {
    name: 'three',
    setLayout,
    draw(ctx, frame) {
      if (disposed || renderer.getContext().isContextLost()) throw new Error('WebGL context unavailable.');
      if (frame.view) {
        const { left, top, scale } = frame.view;
        const transform = `translate(${left}px, ${top}px) scale(${scale})`;
        if (transform !== layerTransform) {
          renderer.domElement.style.transform = transform;
          layerTransform = transform;
        }
      }
      // The city geometry is fixed. Canvas animates weather, halos and sprites
      // over the last WebGL frame. Redraw when the glitch changes a lamp.
      if (!updateLampLevels(frame.lampLevels)) return;
      localLights.forEach((light, index) => { light.intensity = 120 * lampLevels[index]; });
      renderer.render(scene, camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      clearScene();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
