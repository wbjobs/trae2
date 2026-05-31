const PartTypes = {
  GEAR: 'gear',
  AXLE: 'axle',
  LEVER: 'lever',
  SPRING: 'spring',
  PLATE: 'plate',
  SCREW: 'screw',
  PIPE: 'pipe',
  WHEEL: 'wheel',
  PISTON: 'piston',
  BELT: 'belt'
};

const PartColors = {
  BRASS: 0xB5A642,
  COPPER: 0xB87333,
  IRON: 0x434343,
  STEEL: 0x71797E,
  GOLD: 0xFFD700,
  WOOD: 0x8B4513
};

const ConnectionTypes = {
  SNAP: 'snap',
  SCREW: 'screw',
  SLOT: 'slot',
  HINGE: 'hinge'
};

module.exports = { PartTypes, PartColors, ConnectionTypes };
