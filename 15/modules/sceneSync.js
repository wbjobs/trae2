const itemData = require('./itemData');

class SceneSync {
  constructor() {
    this.globalState = {
      inventory: [],
      pickedItems: [],
      flags: { ...itemData.puzzleFlags },
      unlockedScenes: ['entrance'],
      timestamp: Date.now()
    };
    this.playerStates = new Map();
    this.listeners = new Set();
    this.version = 0;
    this._lock = false;
    this._firedEvents = new Set();
    this._pendingEvents = [];
    this._lastState = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify(delta = null) {
    if (this._lock) return;
    this.version++;
    this.globalState.timestamp = Date.now();

    if (delta) {
      const deltaMsg = {
        type: 'delta',
        delta,
        version: this.version,
        timestamp: this.globalState.timestamp
      };
      for (const listener of this.listeners) {
        try { listener(deltaMsg); } catch (e) { console.error('Listener error:', e); }
      }
    } else {
      const snapshot = this._buildFullSnapshot();
      for (const listener of this.listeners) {
        try { listener({ type: 'full', state: snapshot, version: this.version }); } catch (e) { console.error('Listener error:', e); }
      }
    }

    this._lastState = JSON.parse(JSON.stringify(this.globalState));
  }

  _buildFullSnapshot() {
    return {
      global: JSON.parse(JSON.stringify(this.globalState)),
      players: Object.fromEntries(
        Array.from(this.playerStates.entries()).map(([id, s]) => [id, JSON.parse(JSON.stringify(s))])
      ),
      version: this.version,
      timestamp: this.globalState.timestamp
    };
  }

  _computeDelta(oldState, newState) {
    if (!oldState) return null;
    const delta = {};
    let changed = false;

    if (JSON.stringify(oldState.inventory) !== JSON.stringify(newState.inventory)) {
      delta.inventory = newState.inventory;
      changed = true;
    }
    if (JSON.stringify(oldState.pickedItems) !== JSON.stringify(newState.pickedItems)) {
      delta.pickedItems = newState.pickedItems;
      changed = true;
    }
    if (JSON.stringify(oldState.flags) !== JSON.stringify(newState.flags)) {
      delta.flags = newState.flags;
      changed = true;
    }
    if (JSON.stringify(oldState.unlockedScenes) !== JSON.stringify(newState.unlockedScenes)) {
      delta.unlockedScenes = newState.unlockedScenes;
      changed = true;
    }

    return changed ? delta : null;
  }

  getSnapshot() {
    return this._buildFullSnapshot();
  }

  getDeltaSnapshot(baseVersion) {
    const full = this._buildFullSnapshot();
    if (baseVersion === this.version) {
      return { type: 'noop', version: this.version };
    }
    return { type: 'full', state: full, version: this.version };
  }

  getPlayerSnapshot(playerId) {
    const global = JSON.parse(JSON.stringify(this.globalState));
    const player = this.playerStates.get(playerId) || { currentScene: 'entrance' };
    return {
      global,
      self: JSON.parse(JSON.stringify(player)),
      playerId,
      version: this.version,
      timestamp: this.globalState.timestamp
    };
  }

  applyDelta(playerId, delta) {
    if (!delta || typeof delta !== 'object') return false;
    const ps = this._ensurePlayer(playerId);
    let changed = false;

    if (delta.currentScene && delta.currentScene !== ps.currentScene) {
      ps.currentScene = delta.currentScene;
      changed = true;
    }

    return changed;
  }

  getGlobalSnapshot() {
    return JSON.parse(JSON.stringify(this.globalState));
  }

  _ensurePlayer(playerId) {
    if (!this.playerStates.has(playerId)) {
      this.playerStates.set(playerId, {
        currentScene: 'entrance',
        joinedAt: Date.now(),
        hintProgress: {}
      });
    }
    return this.playerStates.get(playerId);
  }

  removePlayer(playerId) {
    this.playerStates.delete(playerId);
  }

  getPlayerCount() {
    return this.playerStates.size;
  }

  loadState(fullState) {
    if (!fullState || typeof fullState !== 'object') return false;

    this._lock = true;
    try {
      if (fullState.global) {
        this.globalState = {
          inventory: Array.isArray(fullState.global.inventory) ? [...fullState.global.inventory] : [],
          pickedItems: Array.isArray(fullState.global.pickedItems) ? [...fullState.global.pickedItems] : [],
          flags: { ...itemData.puzzleFlags, ...(fullState.global.flags || {}) },
          unlockedScenes: Array.isArray(fullState.global.unlockedScenes) && fullState.global.unlockedScenes.length > 0
            ? [...fullState.global.unlockedScenes] : ['entrance'],
          timestamp: Date.now()
        };
      }

      this.playerStates.clear();
      if (fullState.players && typeof fullState.players === 'object') {
        for (const [id, state] of Object.entries(fullState.players)) {
          this.playerStates.set(id, {
            currentScene: state.currentScene || 'entrance',
            joinedAt: state.joinedAt || Date.now(),
            hintProgress: state.hintProgress || {}
          });
        }
      }

      if (fullState.firedEvents) {
        this._firedEvents = new Set(fullState.firedEvents);
      } else {
        this._firedEvents.clear();
      }
    } finally {
      this._lock = false;
    }

    this._notify();
    return true;
  }

  getPlayerScene(playerId) {
    const ps = this._ensurePlayer(playerId);
    return ps.currentScene;
  }

  getInventory() {
    return [...this.globalState.inventory];
  }

  getPickedItems() {
    return [...this.globalState.pickedItems];
  }

  getFlags() {
    return { ...this.globalState.flags };
  }

  getUnlockedScenes() {
    return [...this.globalState.unlockedScenes];
  }

  hasItem(itemId) {
    return this.globalState.inventory.includes(itemId);
  }

  isItemPicked(itemId) {
    return this.globalState.pickedItems.includes(itemId);
  }

  isSceneUnlocked(sceneId) {
    return this.globalState.unlockedScenes.includes(sceneId);
  }

  _fireEvents(triggerType, itemId) {
    const events = itemData.findEventsByTrigger(triggerType, itemId);
    const fired = [];

    for (const event of events) {
      const fireKey = event.once ? event.id : `${event.id}_${Date.now()}`;
      if (event.once && this._firedEvents.has(fireKey)) continue;

      const delay = event.delay || 0;
      const fire = () => {
        if (event.once) this._firedEvents.add(fireKey);
        fired.push({ ...event, firedAt: Date.now() });
      };

      if (delay > 0) {
        setTimeout(fire, delay);
      } else {
        fire();
      }
    }

    return fired;
  }

  pickUpItem(playerId, itemId) {
    const item = itemData.getItem(itemId);
    if (!item) {
      return { success: false, reason: '物品不存在' };
    }

    const ps = this._ensurePlayer(playerId);

    if (item.scene && item.scene !== ps.currentScene) {
      return { success: false, reason: '该物品不在当前场景中' };
    }

    if (this.globalState.pickedItems.includes(itemId)) {
      return { success: false, reason: '该物品已被拾取' };
    }

    if (this.globalState.inventory.includes(itemId)) {
      return { success: false, reason: '该物品已在背包中' };
    }

    const oldState = this._lastState ? JSON.parse(JSON.stringify(this.globalState)) : null;

    this.globalState.pickedItems.push(itemId);
    this.globalState.inventory.push(itemId);

    const delta = this._computeDelta(oldState, this.globalState);
    const events = this._fireEvents('itemPick', itemId);

    if (events.length > 0) {
      this._notify({ ...delta, events });
    } else {
      this._notify(delta);
    }

    return { success: true, item, playerId, events };
  }

  moveToScene(playerId, sceneId) {
    const scene = itemData.getScene(sceneId);
    if (!scene) {
      return { success: false, reason: '场景不存在' };
    }

    if (!this.globalState.unlockedScenes.includes(sceneId)) {
      return { success: false, reason: '该场景尚未解锁' };
    }

    if (scene.locked) {
      if (!this.globalState.inventory.includes(scene.requiredItem)) {
        return { success: false, reason: `需要「${itemData.getItem(scene.requiredItem)?.name || scene.requiredItem}」才能进入` };
      }
    }

    const ps = this._ensurePlayer(playerId);
    ps.currentScene = sceneId;

    this._notify({ playerMoved: { playerId, sceneId } });

    return { success: true, scene, playerId };
  }

  craftItems(ingredientIds) {
    if (!Array.isArray(ingredientIds) || ingredientIds.length < 2) {
      return { success: false, reason: '至少需要两种物品进行合成' };
    }

    for (const id of ingredientIds) {
      if (!this.globalState.inventory.includes(id)) {
        return { success: false, reason: `背包中没有「${itemData.getItem(id)?.name || id}」` };
      }
    }

    const recipe = itemData.findRecipe(ingredientIds);
    if (!recipe) {
      return { success: false, reason: '这些物品无法合成任何东西' };
    }

    const resultItem = itemData.getItem(recipe.result);
    if (this.globalState.inventory.includes(recipe.result)) {
      return { success: false, reason: '合成产物已在背包中' };
    }

    const oldState = this._lastState ? JSON.parse(JSON.stringify(this.globalState)) : null;

    for (const id of ingredientIds) {
      const idx = this.globalState.inventory.indexOf(id);
      if (idx > -1) this.globalState.inventory.splice(idx, 1);
    }
    this.globalState.inventory.push(recipe.result);
    this._updateCraftedFlags(recipe.result);

    const delta = this._computeDelta(oldState, this.globalState);
    const events = this._fireEvents('itemCraft', recipe.result);

    if (events.length > 0) {
      this._notify({ ...delta, events, crafted: recipe.result });
    } else {
      this._notify(delta);
    }

    return { success: true, result: resultItem, recipe, events };
  }

  _updateCraftedFlags(resultId) {
    switch (resultId) {
      case 'litTorch':
        this.globalState.flags.gateUnlocked = true;
        if (!this.globalState.unlockedScenes.includes('library')) {
          this.globalState.unlockedScenes.push('library');
        }
        if (!this.globalState.unlockedScenes.includes('cave')) {
          this.globalState.unlockedScenes.push('cave');
        }
        break;
      case 'decipheredScroll':
        this.globalState.flags.scrollRead = true;
        break;
      case 'treasureKey':
        if (!this.globalState.unlockedScenes.includes('treasury')) {
          this.globalState.unlockedScenes.push('treasury');
        }
        this.globalState.flags.treasureFound = true;
        break;
    }
  }

  getAvailableExits(playerId) {
    const ps = this._ensurePlayer(playerId);
    const scene = itemData.getScene(ps.currentScene);
    if (!scene || !scene.exits) return [];

    const exits = [];
    for (const [direction, targetSceneId] of Object.entries(scene.exits)) {
      const targetScene = itemData.getScene(targetSceneId);
      const unlocked = this.globalState.unlockedScenes.includes(targetSceneId);
      const canEnter = !targetScene.locked || this.globalState.inventory.includes(targetScene.requiredItem);
      exits.push({
        direction,
        targetScene: targetSceneId,
        targetName: targetScene?.name || targetSceneId,
        unlocked,
        canEnter
      });
    }
    return exits;
  }

  getSceneItems(playerId) {
    const ps = this._ensurePlayer(playerId);
    const scene = itemData.getScene(ps.currentScene);
    if (!scene) return [];
    return scene.items
      .filter(id => !this.globalState.pickedItems.includes(id))
      .map(id => itemData.getItem(id))
      .filter(Boolean);
  }

  getHint(playerId, itemId) {
    const ps = this._ensurePlayer(playerId);
    if (!ps.hintProgress) ps.hintProgress = {};
    const progress = ps.hintProgress[itemId] || 0;
    const hint = itemData.getItemHint(itemId, progress);
    if (hint) {
      ps.hintProgress[itemId] = progress + 1;
    }
    return hint;
  }

  getAllHints(playerId) {
    const ps = this._ensurePlayer(playerId);
    if (!ps.hintProgress) ps.hintProgress = {};
    const hints = [];
    for (const itemId of this.globalState.inventory) {
      const progress = ps.hintProgress[itemId] || 0;
      const hint = itemData.getItemHint(itemId, progress);
      if (hint) {
        hints.push({ itemId, hint, progress });
      }
    }
    return hints;
  }

  reset() {
    this._lock = true;
    try {
      this.globalState = {
        inventory: [],
        pickedItems: [],
        flags: { ...itemData.puzzleFlags },
        unlockedScenes: ['entrance'],
        timestamp: Date.now()
      };
      for (const ps of this.playerStates.values()) {
        ps.currentScene = 'entrance';
        ps.hintProgress = {};
      }
      this._firedEvents.clear();
      this._lastState = null;
    } finally {
      this._lock = false;
    }
    this._notify();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SceneSync;
}