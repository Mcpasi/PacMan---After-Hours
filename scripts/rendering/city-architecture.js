// Building and platform geometry for both renderers. Positions are the
// north-west, bottom corner of each box in maze coordinates.
const CityArchitecture = (() => {
  const projection = typeof module !== 'undefined' && module.exports ? require('./city-view') : CityView;
  const materials = {
    foundation: { color: '#182831', roughness: 0.88 },
    coping: { color: '#566f73', roughness: 0.56, metalness: 0.22 },
    stone: { color: '#45636d', roughness: 0.86 },
    brick: { color: '#76554d', roughness: 0.93 },
    tile: { color: '#3f6965', roughness: 0.72 },
    slate: { color: '#293f4d', roughness: 0.72 },
    copper: { color: '#365752', roughness: 0.7, metalness: 0.3 },
    tar: { color: '#263941', roughness: 0.96 },
    casement: { color: '#192a34', roughness: 0.82 },
    pane: { color: '#52777c', roughness: 0.49, metalness: 0.1 },
    warm: { color: '#edab6d', emissive: '#df8a4e', emissiveIntensity: 0.72 },
    cool: { color: '#80c4bb', emissive: '#438c90', emissiveIntensity: 0.56 }
  };
  const finishes = [
    { facade: 'brick', roof: 'tar' },
    { facade: 'stone', roof: 'slate' },
    { facade: 'tile', roof: 'copper' }
  ];
  const lanternHeight = 0.76;

  function box(material, x, y, z, width, depth, height) {
    return { material, x, y, z, width, depth, height };
  }

  function platform({ width, height, tile }) {
    return [
      box('foundation', 0, 0, -tile * 0.68, width, height, tile * 0.56),
      box('coping', 0, 0, -tile * 0.12, width, height, tile * 0.11)
    ];
  }

  function building(block, tile) {
    const { x, y, width, depth, height, seed } = block;
    const unit = tile / 16;
    const inset = unit * 0.6;
    const west = x + inset, north = y + inset;
    const east = x + width - inset, south = y + depth - inset;
    const { facade, roof } = finishes[Math.floor(seed * finishes.length)];
    const parts = [
      box(facade, west, north, 0, east - west, south - north, height),
      box('coping', x + inset / 2, y + inset / 2, height - unit * 0.85,
        width - inset, depth - inset, unit * 1.15),
      box(roof, west + unit, north + unit, height + unit * 0.3,
        east - west - unit * 2, south - north - unit * 2, unit * 0.6)
    ];
    const sill = height * 0.27, windowHeight = height * 0.47;
    for (const side of ['south', 'east']) {
      const horizontal = side === 'south';
      const length = horizontal ? width : depth;
      function facadeBox(material, offset, z, span, tall, thick) {
        return horizontal ? box(material, x + offset, south - thick / 2, z, span, thick, tall)
          : box(material, east - thick / 2, y + offset, z, thick, span, tall);
      }
      parts.push(facadeBox('coping', 1.2 * unit, sill - 0.8 * unit, length - 2.4 * unit, 0.4 * unit, 0.8 * unit));
      for (let i = 0; i < length / tile; i++) {
        // Uneven lit windows distinguish the brick, slate and copper blocks.
        const pattern = (Math.floor(seed * 97) + i * 7 + (horizontal ? 1 : 3)) % 11;
        const glass = pattern < 3 ? 'warm' : pattern === 4 ? 'cool' : 'pane';
        const offset = i * tile + 3.5 * unit;
        parts.push(facadeBox('casement', offset, sill, 8.4 * unit, windowHeight, 0.5 * unit));
        for (const pane of [0.7, 4.5]) {
          parts.push(facadeBox(glass, offset + pane * unit, sill + unit * 0.4,
            3.1 * unit, windowHeight - unit * 0.8, unit * 0.78));
        }
      }
    }
    if (width >= tile * 2 && depth >= tile * 2) {
      const ventX = x + width * 0.32, ventY = y + depth * 0.37;
      const ventZ = height + unit * 0.9;
      parts.push(box('foundation', ventX, ventY, ventZ, 10 * unit, 7 * unit, 2.5 * unit));
      parts.push(box('coping', ventX + unit * 0.5, ventY + unit * 0.5, ventZ + unit * 2.5,
        9 * unit, 6 * unit, unit * 0.45));
      for (let i = 1; i <= 3; i++) {
        parts.push(box('tar', ventX + unit * 1.6, ventY + unit * (0.5 + i * 1.4), ventZ + unit * 2.95,
          6.8 * unit, unit * 0.55, unit * 0.1));
      }
    }
    return parts;
  }

  function faces(view, part) {
    const { x, y, z, width, depth, height } = part;
    const east = x + width, south = y + depth, top = z + height;
    const nw = projection.project(view, x, y, top);
    const ne = projection.project(view, east, y, top);
    const sw = projection.project(view, x, south, top);
    const se = projection.project(view, east, south, top);
    const base = projection.project(view, east, south, z);
    return [
      [sw, se, base, projection.project(view, x, south, z)],
      [se, ne, projection.project(view, east, y, z), base],
      [nw, ne, se, sw]
    ];
  }

  function orderedBuildings(layout) {
    const depth = block => projection.project(layout.view, block.x + block.width, block.y + block.depth)[1];
    return layout.buildings.slice().sort((a, b) => depth(a) - depth(b));
  }

  return { materials, lanternHeight, platform, building, faces, orderedBuildings };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CityArchitecture;
