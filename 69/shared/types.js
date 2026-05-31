const GameTypes = {
  createPlayer: (id, name) => ({
    id,
    name,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    selectedPart: null,
    grabbedPart: null,
    color: `hsl(${Math.random() * 360}, 70%, 50%)`,
    joinedAt: Date.now()
  }),

  createPart: (id, config) => ({
    id,
    name: config.name,
    type: config.type,
    model: config.model,
    position: { ...config.position },
    rotation: { ...config.rotation },
    targetPosition: config.targetPosition ? { ...config.targetPosition } : null,
    targetRotation: config.targetRotation ? { ...config.targetRotation } : null,
    snapPoints: config.snapPoints || [],
    connections: config.connections || [],
    state: config.initialState || 'disassembled',
    assembledTo: null,
    grabbedBy: null,
    isKey: config.isKey || false,
    properties: config.properties || {}
  }),

  createMessage: (type, data, senderId = null) => ({
    type,
    data,
    senderId,
    timestamp: Date.now()
  }),

  createSceneState: (levelId, parts, players, completed) => ({
    levelId,
    parts,
    players,
    completed: completed || false,
    timestamp: Date.now()
  }),

  createSaveData: (id, name, levelId, sceneState, metadata) => ({
    id,
    name,
    levelId,
    sceneState,
    metadata: metadata || {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  })
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameTypes;
}
