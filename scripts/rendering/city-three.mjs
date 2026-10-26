// The Three.js dependency is injected so scene construction can also be tested without a GPU.
export function createCityScene({ three: THREE, canvas, paintGround, onFailure,
  document: dom = globalThis.document, pixelRatio = globalThis.devicePixelRatio || 1 }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(pixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.className = 'city-scene';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#101b22');
  const camera = new THREE.OrthographicCamera();
  const resources = new Set();
  let disposed = false, glowMaterial, lanternMaterial, localLights = [];
  const own = resource => { resources.add(resource); return resource; };

  function clearScene() {
    scene.clear();
    for (const resource of resources) resource.dispose();
    resources.clear();
    localLights = [];
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
    const { width, height, tile } = layout;
    renderer.setSize(width, height, false);
    // Exact ground-plane alignment with the independent 2D actors and collision grid.
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.near = 1;
    camera.far = 1600;
    camera.position.set(width / 2, -height / 2, 800);
    camera.lookAt(width / 2, -height / 2, 0);
    camera.updateProjectionMatrix();

    scene.add(new THREE.HemisphereLight('#afccd4', '#151b28', 1.4));
    const moon = new THREE.DirectionalLight('#9ab9d2', 2.2);
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
    }
    const stone = own(new THREE.MeshStandardMaterial({ color: '#34434a', roughness: 0.87 }));
    const roof = own(new THREE.MeshStandardMaterial({ color: '#1d2d37', roughness: 0.76, metalness: 0.18 }));
    const trim = own(new THREE.MeshStandardMaterial({ color: '#62716e', roughness: 0.6, metalness: 0.35 }));
    const windows = own(new THREE.MeshStandardMaterial({ color: '#bc8750', emissive: '#dc9b4e', emissiveIntensity: 0.6 }));
    const bodies = [], roofs = [], edges = [], vents = [], panes = [];
    for (const building of layout.buildings) {
      const { x, y, width: w, depth: d, height: z } = building;
      bodies.push({ x: x + w / 2, y: y + d / 2, z: z / 2, width: w - 1, depth: d - 1, height: z });
      roofs.push({ x: x + w / 2, y: y + d / 2, z: z + 0.7, width: w - 5, depth: d - 5, height: 1.4 });
      edges.push(
        { x: x + w / 2, y: y + 2, z: z + 1, width: w - 3, depth: 1.2, height: 2 },
        { x: x + w / 2, y: y + d - 2, z: z + 1, width: w - 3, depth: 1.2, height: 2 },
        { x: x + 2, y: y + d / 2, z: z + 1, width: 1.2, depth: d - 3, height: 2 },
        { x: x + w - 2, y: y + d / 2, z: z + 1, width: 1.2, depth: d - 3, height: 2 }
      );
      if (w > tile && d > tile) {
        vents.push({ x: x + 10, y: y + 10, z: z + 3, width: 7, depth: 9, height: 5 });
        for (let i = 0; i < 3; i++) {
          roofs.push({ x: x + 10, y: y + 7 + i * 2, z: z + 5.6, width: 5, depth: 0.8, height: 0.3 });
        }
      }
      for (let wx = x + 7; wx < x + w - 4; wx += tile) {
        panes.push({ x: wx, y: y + d - 3.5, z: z + 2.1, width: 4, depth: 1.5, height: 0.4 });
      }
      if (w >= tile * 4 && d >= tile * 2) {
        const sign = textureFrom(ctx => {
          ctx.fillStyle = '#0c1820'; ctx.fillRect(0, 0, 256, 64);
          ctx.fillStyle = building.seed > 0.5 ? '#e49c84' : '#9bc3bd';
          ctx.font = 'bold 34px monospace'; ctx.textAlign = 'center';
          ctx.fillText(building.seed > 0.5 ? 'MOTEL' : 'LAST STOP', 128, 44);
        }, 256, 64);
        const material = own(new THREE.MeshBasicMaterial({ map: sign }));
        const mesh = new THREE.Mesh(plane, material);
        mesh.position.set(x + w / 2, -(y + d * 0.65), z + 2.2);
        mesh.scale.set(Math.min(56, w - 10), 12, 1);
        scene.add(mesh);
      }
    }
    instances(box, stone, bodies, true);
    instances(box, roof, roofs, true);
    instances(box, trim, edges, true);
    instances(box, trim, vents, true);
    instances(box, windows, panes);

    const groundTexture = textureFrom(ctx => { ctx.scale(2, 2); paintGround(ctx, layout); }, width * 2, height * 2);
    const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(width, height)),
      own(new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.45, metalness: 0.25 })));
    ground.position.set(width / 2, -height / 2, -0.1);
    ground.receiveShadow = true;
    scene.add(ground);

    const glow = textureFrom(ctx => {
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255, 199, 108, 0.75)');
      gradient.addColorStop(0.25, 'rgba(243, 172, 77, 0.28)');
      gradient.addColorStop(1, 'rgba(223, 135, 52, 0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    }, 128, 128);
    glowMaterial = own(new THREE.MeshBasicMaterial({ map: glow, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.85 }));
    lanternMaterial = own(new THREE.MeshStandardMaterial({ color: '#ffe6ad', emissive: '#ffc375', emissiveIntensity: 2 }));
    const posts = [], lanterns = [], caps = [], pools = [];
    layout.lamps.forEach((lamp, i) => {
      const z = tile * 0.65;
      posts.push({ x: lamp.x, y: lamp.y, z: z / 2, width: 1.2, depth: 1.2, height: z });
      lanterns.push({ x: lamp.x, y: lamp.y, z, width: 3, depth: 3, height: 4 });
      caps.push({ x: lamp.x, y: lamp.y, z: z + 2.5, width: 4.5, depth: 4.5, height: 0.7 });
      pools.push({ x: lamp.x, y: lamp.y, z: 0.1, width: tile * 5, depth: tile * 5 });
      // A fixed light budget avoids a shader/light for every streetlamp on mobile GPUs.
      if (i < 3) {
        const light = new THREE.PointLight('#ffbd70', 120, tile * 5, 1.4);
        light.position.set(lamp.x, -lamp.y, z + 3);
        localLights.push(light);
        scene.add(light);
      }
    });
    instances(box, trim, posts, true);
    instances(box, lanternMaterial, lanterns);
    instances(box, trim, caps, true);
    instances(plane, glowMaterial, pools);
    // A smaller halo above the cap makes the glowing lantern visible from overhead.
    instances(plane, glowMaterial, layout.lamps.map(lamp => ({ x: lamp.x, y: lamp.y,
      z: tile * 0.65 + 3, width: 13, depth: 13 })));
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    if (!renderer.domElement.parentNode) canvas.parentNode.insertBefore(renderer.domElement, canvas);
  }

  return {
    name: 'three',
    setLayout,
    draw(ctx, frame) {
      if (disposed || renderer.getContext().isContextLost()) throw new Error('WebGL context unavailable.');
      const intensity = frame.reducedMotion ? 1 : 0.96 + Math.sin(frame.time * 1.8) * 0.04;
      glowMaterial.opacity = 0.85 * intensity;
      lanternMaterial.emissiveIntensity = 2 * intensity;
      localLights.forEach(light => { light.intensity = 120 * intensity; });
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
