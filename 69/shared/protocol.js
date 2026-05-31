const Protocol = {
  MSG_TYPES: {
    PLAYER_JOIN: 'player_join',
    PLAYER_LEAVE: 'player_leave',
    PLAYER_LIST: 'player_list',
    PLAYER_ACTION: 'player_action',

    PART_SELECT: 'part_select',
    PART_DESELECT: 'part_deselect',
    PART_GRAB: 'part_grab',
    PART_RELEASE: 'part_release',
    PART_MOVE: 'part_move',
    PART_ROTATE: 'part_rotate',
    PART_SNAP: 'part_snap',
    PART_STATE: 'part_state',
    PART_ASSEMBLE: 'part_assemble',
    PART_DISASSEMBLE: 'part_disassemble',

    SCENE_SYNC: 'scene_sync',
    SCENE_STATE: 'scene_state',

    LEVEL_LOAD: 'level_load',
    LEVEL_COMPLETE: 'level_complete',
    LEVEL_LIST: 'level_list',

    SAVE_CREATE: 'save_create',
    SAVE_LOAD: 'save_load',
    SAVE_DELETE: 'save_delete',
    SAVE_LIST: 'save_list',
    SAVE_DATA: 'save_data',

    CHAT_MESSAGE: 'chat_message',
    ERROR: 'error',
    SUCCESS: 'success',
    PING: 'ping',
    PONG: 'pong'
  },

  PART_STATES: {
    ASSEMBLED: 'assembled',
    DISASSEMBLED: 'disassembled',
    GRABBED: 'grabbed',
    SNAPPED: 'snapped'
  },

  ACTIONS: {
    MOVE: 'move',
    ROTATE: 'rotate',
    GRAB: 'grab',
    RELEASE: 'release',
    ASSEMBLE: 'assemble',
    DISASSEMBLE: 'disassemble'
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Protocol;
}
