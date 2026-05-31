const itemData = {
  items: {
    rustyKey: {
      id: 'rustyKey',
      name: '锈迹斑斑的钥匙',
      desc: '一把古老的铜钥匙，表面布满铁锈，似乎能打开某扇尘封的门。',
      icon: '🗝️',
      scene: 'entrance',
      position: { x: 120, y: 300 },
      hints: [
        '这把钥匙的造型很特别...',
        '似乎与某处的锁孔相匹配',
        '宝石+镜片+钥匙会产生什么？'
      ]
    },
    torch: {
      id: 'torch',
      name: '火把',
      desc: '一支浸满油脂的火把，点燃后可以照亮黑暗的通道。',
      icon: '🔥',
      scene: 'entrance',
      position: { x: 450, y: 180 },
      hints: [
        '火把还没有点燃...',
        '水晶碎片似乎蕴含能量',
        '水晶的光芒或许能点燃火把'
      ]
    },
    ancientScroll: {
      id: 'ancientScroll',
      name: '古老卷轴',
      desc: '羊皮纸上写满了神秘符文，记载着秘境深处的秘密。',
      icon: '📜',
      scene: 'library',
      position: { x: 200, y: 250 },
      hints: [
        '符文太模糊了，看不清楚...',
        '需要某种光源来照亮文字',
        '水晶的光芒或许能揭示卷轴上的秘密'
      ]
    },
    crystalShard: {
      id: 'crystalShard',
      name: '水晶碎片',
      desc: '散发着淡蓝色光芒的水晶碎片，似乎蕴含某种能量。',
      icon: '💎',
      scene: 'cave',
      position: { x: 380, y: 200 },
      hints: [
        '这块水晶在微微发光...',
        '它的能量或许能点燃什么',
        '试试将它靠近火把或卷轴'
      ]
    },
    gemstone: {
      id: 'gemstone',
      name: '宝石',
      desc: '切割精美的红宝石，在黑暗中闪烁着迷人的光泽。',
      icon: '💠',
      scene: 'treasury',
      position: { x: 300, y: 150 },
      hints: [
        '这颗宝石似乎是某个机关的一部分...',
        '机械镜片可以放大它的光芒',
        '与钥匙和镜片组合会如何？'
      ]
    },
    mechanicLens: {
      id: 'mechanicLens',
      name: '机械镜片',
      desc: '一块精密的凸透镜，能够看清细小的机关结构。',
      icon: '🔍',
      scene: 'library',
      position: { x: 500, y: 320 },
      hints: [
        '这块镜片可以聚焦光线...',
        '宝石的光芒通过它会怎样？',
        '宝石+镜片+钥匙的组合值得一试'
      ]
    },
    stoneTablet: {
      id: 'stoneTablet',
      name: '石板',
      desc: '刻有古老符号的石板，似乎是某种地图或密码。',
      icon: '🪨',
      scene: 'entrance',
      position: { x: 600, y: 280 },
      hints: [
        '石板上的符号指向东方和南方...',
        '图书馆和洞穴似乎是探索的方向',
        '先探索这些地方收集道具吧'
      ]
    },
    rope: {
      id: 'rope',
      name: '麻绳',
      desc: '结实的麻绳，可以用来攀爬或捆绑。',
      icon: '🪢',
      scene: 'cave',
      position: { x: 150, y: 350 },
      hints: [
        '这根麻绳很结实...',
        '或许以后会用到',
        '先收好以备不时之需'
      ]
    },
    litTorch: {
      id: 'litTorch',
      name: '燃烧的火把',
      desc: '火把已经点燃，照亮了周围的环境。',
      icon: '🔦',
      scene: null,
      position: null,
      crafted: true,
      hints: ['火把照亮了前方的道路']
    },
    decipheredScroll: {
      id: 'decipheredScroll',
      name: '破译的卷轴',
      desc: '通过水晶碎片的能量，卷轴上的文字已经变得清晰可读。',
      icon: '📖',
      scene: null,
      position: null,
      crafted: true,
      hints: ['卷轴揭示了宝库的位置']
    },
    treasureKey: {
      id: 'treasureKey',
      name: '宝库之钥',
      desc: '用宝石和机械部件制成的钥匙，能够打开宝库的大门。',
      icon: '🔑',
      scene: null,
      position: null,
      crafted: true,
      hints: ['拿着这把钥匙去宝库吧！']
    }
  },

  recipes: [
    {
      ingredients: ['torch', 'rustyKey'],
      result: 'litTorch',
      hint: '将钥匙靠近火把...不对，火把需要被点燃'
    },
    {
      ingredients: ['torch', 'crystalShard'],
      result: 'litTorch',
      hint: '水晶的能量或许能点燃火把'
    },
    {
      ingredients: ['ancientScroll', 'crystalShard'],
      result: 'decipheredScroll',
      hint: '水晶的光芒或许能揭示卷轴上的秘密'
    },
    {
      ingredients: ['gemstone', 'mechanicLens', 'rustyKey'],
      result: 'treasureKey',
      hint: '宝石、镜片和钥匙的组合...'
    }
  ],

  scenes: {
    entrance: {
      id: 'entrance',
      name: '秘境入口',
      desc: '一扇古老的石门矗立在你面前，门上的锁孔布满灰尘。',
      background: '#1a1a2e',
      items: ['rustyKey', 'torch', 'stoneTablet'],
      exits: {
        east: 'library',
        south: 'cave'
      },
      events: [
        {
          id: 'firstLight',
          trigger: { type: 'itemPick', itemId: 'torch' },
          once: true,
          effect: {
            type: 'hint',
            message: '火把还没点燃，去找找能点燃它的东西吧...'
          }
        },
        {
          id: 'tabletRead',
          trigger: { type: 'itemPick', itemId: 'stoneTablet' },
          once: true,
          effect: {
            type: 'hint',
            message: '石板上写着：「东有书香，南有幽光，二者合一，宝藏现矣」'
          }
        }
      ]
    },
    library: {
      id: 'library',
      name: '尘封图书馆',
      desc: '高耸的书架延伸至黑暗的天花板，一张书桌在角落发着微光。',
      background: '#2d1b2e',
      items: ['ancientScroll', 'mechanicLens'],
      exits: {
        west: 'entrance',
        north: 'treasury'
      },
      events: [
        {
          id: 'scrollFound',
          trigger: { type: 'itemPick', itemId: 'ancientScroll' },
          once: true,
          effect: {
            type: 'hint',
            message: '卷轴上的符文太模糊了，需要某种光源才能看清...'
          }
        },
        {
          id: 'lensFound',
          trigger: { type: 'itemPick', itemId: 'mechanicLens' },
          once: true,
          effect: {
            type: 'hint',
            message: '这块精密的镜片...或许能聚焦某种能量？'
          }
        }
      ]
    },
    cave: {
      id: 'cave',
      name: '幽暗洞穴',
      desc: '潮湿的洞穴中回响着水滴声，远处闪烁着微弱的光芒。',
      background: '#0f2027',
      items: ['crystalShard', 'rope'],
      exits: {
        north: 'entrance'
      },
      events: [
        {
          id: 'crystalGlow',
          trigger: { type: 'itemPick', itemId: 'crystalShard' },
          once: true,
          effect: {
            type: 'hint',
            message: '水晶碎片在你手中发出柔和的蓝光，它似乎蕴含着某种能量...'
          }
        },
        {
          id: 'crystalCraftHint',
          trigger: { type: 'itemPick', itemId: 'crystalShard' },
          once: true,
          delay: 2000,
          effect: {
            type: 'hint',
            message: '试试把水晶和其他物品组合使用吧！'
          }
        }
      ]
    },
    treasury: {
      id: 'treasury',
      name: '宝库',
      desc: '金碧辉煌的宝库中央放着一个上锁的大宝箱。',
      background: '#2c1810',
      items: ['gemstone'],
      exits: {
        south: 'library'
      },
      locked: true,
      requiredItem: 'treasureKey',
      events: [
        {
          id: 'gemFound',
          trigger: { type: 'itemPick', itemId: 'gemstone' },
          once: true,
          effect: {
            type: 'hint',
            message: '这颗红宝石...似乎能和镜片、钥匙组合成什么？'
          }
        },
        {
          id: 'victory',
          trigger: { type: 'itemCraft', itemId: 'treasureKey' },
          once: true,
          effect: {
            type: 'hint',
            message: '🎉 恭喜！你合成了宝库之钥！去宝库开启宝藏吧！'
          }
        }
      ]
    }
  },

  puzzleFlags: {
    gateUnlocked: false,
    scrollRead: false,
    treasureFound: false
  },

  findRecipe(ingredientIds) {
    const sorted = [...ingredientIds].sort();
    for (const recipe of this.recipes) {
      const sortedRecipe = [...recipe.ingredients].sort();
      if (sorted.length === sortedRecipe.length &&
          sorted.every((v, i) => v === sortedRecipe[i])) {
        return recipe;
      }
    }
    return null;
  },

  getItem(id) {
    return this.items[id] || null;
  },

  getScene(id) {
    return this.scenes[id] || null;
  },

  getScenes() {
    return { ...this.scenes };
  },

  getItemsForScene(sceneId) {
    const scene = this.scenes[sceneId];
    if (!scene) return [];
    return scene.items.map(id => this.items[id]).filter(Boolean);
  },

  getItemHint(itemId, progress = 0) {
    const item = this.items[itemId];
    if (!item || !item.hints || item.hints.length === 0) return null;
    const idx = Math.min(progress, item.hints.length - 1);
    return item.hints[idx];
  },

  getSceneEvents(sceneId) {
    const scene = this.scenes[sceneId];
    return scene?.events || [];
  },

  getAllEvents() {
    const all = [];
    for (const scene of Object.values(this.scenes)) {
      if (scene.events) all.push(...scene.events);
    }
    return all;
  },

  findEventsByTrigger(triggerType, itemId) {
    return this.getAllEvents().filter(e =>
      e.trigger.type === triggerType &&
      (!e.trigger.itemId || e.trigger.itemId === itemId)
    );
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = itemData;
}