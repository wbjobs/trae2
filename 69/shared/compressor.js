const DataCompressor = {
  SHORT_KEYS: {
    i: 'id',
    n: 'name',
    t: 'type',
    m: 'model',
    p: 'position',
    r: 'rotation',
    tp: 'targetPosition',
    tr: 'targetRotation',
    s: 'state',
    g: 'grabbedBy',
    a: 'assembledTo',
    k: 'isKey',
    sp: 'snapPoints',
    c: 'connections',
    pr: 'properties',
    x: 'x',
    y: 'y',
    z: 'z',
    col: 'color',
    sz: 'size',
    te: 'teeth'
  },

  KEY_SHORTS: {
    id: 'i',
    name: 'n',
    type: 't',
    model: 'm',
    position: 'p',
    rotation: 'r',
    targetPosition: 'tp',
    targetRotation: 'tr',
    state: 's',
    grabbedBy: 'g',
    assembledTo: 'a',
    isKey: 'k',
    snapPoints: 'sp',
    connections: 'c',
    properties: 'pr',
    x: 'x',
    y: 'y',
    z: 'z',
    color: 'col',
    size: 'sz',
    teeth: 'te'
  },

  compressPart(part) {
    if (!part) return null;

    return {
      i: part.id,
      p: this.compressVector(part.position),
      r: this.compressVector(part.rotation),
      s: part.state,
      g: part.grabbedBy,
      ...(part.lastModified && { lm: part.lastModified })
    };
  },

  decompressPart(compressed) {
    if (!compressed) return null;

    return {
      id: compressed.i,
      position: this.decompressVector(compressed.p),
      rotation: this.decompressVector(compressed.r),
      state: compressed.s,
      grabbedBy: compressed.g,
      lastModified: compressed.lm
    };
  },

  compressVector(vec) {
    if (!vec) return null;
    return [
      Math.round(vec.x * 100) / 100,
      Math.round(vec.y * 100) / 100,
      Math.round(vec.z * 100) / 100
    ];
  },

  decompressVector(arr) {
    if (!arr || arr.length < 3) return { x: 0, y: 0, z: 0 };
    return { x: arr[0], y: arr[1], z: arr[2] };
  },

  compressPartsUpdate(parts) {
    if (!parts || parts.length === 0) return null;

    return {
      t: Date.now(),
      p: parts.map(p => this.compressPart(p))
    };
  },

  decompressPartsUpdate(compressed) {
    if (!compressed || !compressed.p) return [];

    return compressed.p.map(p => this.decompressPart(p));
  },

  compressFullState(state) {
    if (!state) return null;

    return {
      t: Date.now(),
      v: state.version || 0,
      l: state.levelId,
      c: state.completed,
      ps: state.parts?.map(p => this.compressPartFull(p)) || [],
      pl: state.players ? this.compressPlayers(state.players) : {}
    };
  },

  compressPartFull(part) {
    return {
      i: part.id,
      n: part.name,
      t: part.type,
      m: part.model,
      p: this.compressVector(part.position),
      r: this.compressVector(part.rotation),
      tp: part.targetPosition ? this.compressVector(part.targetPosition) : null,
      tr: part.targetRotation ? this.compressVector(part.targetRotation) : null,
      s: part.state,
      k: part.isKey,
      g: part.grabbedBy,
      sp: part.snapPoints,
      c: part.connections,
      pr: part.properties
    };
  },

  decompressPartFull(compressed) {
    return {
      id: compressed.i,
      name: compressed.n,
      type: compressed.t,
      model: compressed.m,
      position: this.decompressVector(compressed.p),
      rotation: this.decompressVector(compressed.r),
      targetPosition: compressed.tp ? this.decompressVector(compressed.tp) : null,
      targetRotation: compressed.tr ? this.decompressVector(compressed.tr) : null,
      state: compressed.s,
      isKey: compressed.k,
      grabbedBy: compressed.g,
      snapPoints: compressed.sp,
      connections: compressed.c,
      properties: compressed.pr
    };
  },

  compressPlayers(players) {
    const compressed = {};
    Object.keys(players).forEach(id => {
      const p = players[id];
      compressed[id] = {
        i: p.id,
        n: p.name,
        c: p.color,
        p: this.compressVector(p.position)
      };
    });
    return compressed;
  },

  calculateSize(obj) {
    return new Blob([JSON.stringify(obj)]).size;
  },

  getCompressionRatio(original, compressed) {
    const origSize = this.calculateSize(original);
    const compSize = this.calculateSize(compressed);
    return {
      original: origSize,
      compressed: compSize,
      ratio: origSize > 0 ? compSize / origSize : 0,
      saved: origSize - compSize
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataCompressor;
}
