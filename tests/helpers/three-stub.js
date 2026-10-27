// Scene-graph double, not a rasterizer. Real pixels are covered by the optional browser test.
function createThreeStub() {
  const resources = [], renderers = [];
  const vector = () => ({ set(...values) { this.values = values; } });
  class Resource {
    constructor() { this.disposals = 0; resources.push(this); }
    dispose() { this.disposals++; }
  }
  class Object3D {
    constructor() { this.position = vector(); this.scale = vector(); }
    updateMatrix() { this.matrix = { position: [...this.position.values], scale: [...this.scale.values] }; }
  }
  class Scene {
    constructor() { this.children = []; }
    add(...children) { this.children.push(...children); }
    clear() { this.children = []; }
  }
  class Material extends Resource { constructor(options) { super(); Object.assign(this, options); } }
  class Mesh extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
  class InstancedMesh extends Mesh {
    constructor(geometry, material, count) {
      super(geometry, material); this.count = count; this.matrices = []; this.instanceMatrix = {};
      this.disposals = 0; resources.push(this);
    }
    setMatrixAt(index, matrix) { this.matrices[index] = structuredClone(matrix); }
    setColorAt(index, color) {
      this.instanceColor ||= { colors: [] };
      this.instanceColor.colors[index] = [color.r, color.g, color.b];
    }
    dispose() { this.disposals++; }
  }
  class Light extends Object3D {
    constructor(color, intensity) { super(); this.color = color; this.intensity = intensity; }
  }
  class DirectionalLight extends Light {
    constructor(...args) {
      super(...args); this.target = new Object3D();
      this.shadow = Object.assign(new Resource(), { mapSize: vector(), camera: {} });
    }
  }
  class OrthographicCamera extends Object3D {
    lookAt(...values) { this.target = values; }
    updateProjectionMatrix() { this.projectionUpdated = true; }
  }
  class Element {
    constructor() { this.listeners = new Map(); }
    setAttribute() {}
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    removeEventListener(name) { this.listeners.delete(name); }
    getContext() { return { scale() {}, fillRect() {}, fillText() {}, createRadialGradient() { return { addColorStop() {} }; } }; }
    remove() { this.parentNode = null; }
  }
  class WebGLRenderer {
    constructor(options) {
      this.options = options; this.domElement = new Element(); this.shadowMap = {};
      this.renderLists = new Resource(); this.capabilities = { getMaxAnisotropy: () => 16 };
      this.context = { isContextLost: () => this.lost };
      this.frames = 0; this.disposals = 0; renderers.push(this);
    }
    setPixelRatio(value) { this.pixelRatio = value; }
    setSize(...values) { this.size = values; }
    render(scene, camera) { this.scene = scene; this.camera = camera; this.frames++; }
    getContext() { return this.context; }
    dispose() { this.disposals++; }
  }
  class CanvasTexture extends Resource { constructor(surface) { super(); this.image = surface; } }
  const document = { createElement: () => new Element() };
  const canvas = new Element();
  canvas.parentNode = { insertBefore(child, before) { assertCanvas(before); child.parentNode = this; } };
  function assertCanvas(before) { if (before !== canvas) throw new Error('Wrong overlay canvas'); }
  return {
    resources, renderers, document, canvas,
    three: {
      WebGLRenderer, Scene, Object3D, OrthographicCamera, DirectionalLight, InstancedMesh, Mesh, CanvasTexture,
      Color: class {
        constructor(value) { this.value = value; }
        setRGB(r, g, b) { Object.assign(this, { r, g, b }); return this; }
      },
      HemisphereLight: Light, PointLight: Light,
      BoxGeometry: Resource, PlaneGeometry: Resource, MeshStandardMaterial: Material, MeshBasicMaterial: Material,
      SRGBColorSpace: 'srgb', ACESFilmicToneMapping: 'aces', PCFSoftShadowMap: 'pcf', AdditiveBlending: 'additive'
    }
  };
}

module.exports = { createThreeStub };
