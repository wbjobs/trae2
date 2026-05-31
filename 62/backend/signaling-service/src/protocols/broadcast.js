/**
 * 广播信令协议解析器 (PAS - Public Address System)
 * 处理地铁公共广播系统信令，包括:
 * - GB28181 (国标协议，中国安全防范视频监控标准)
 * - SIP 广播信令
 * - PAGA (Public Address & General Alarm) 协议
 * - 私有广播控制器协议
 */

const crypto = require('crypto');

const BROADCAST_TYPES = [
  { type: 'normal', desc: '常规广播' },
  { type: 'emergency', desc: '紧急广播' },
  { type: 'fire_alarm', desc: '火灾警报' },
  { type: 'platform_guide', desc: '站台引导广播' },
  { type: 'train_arrival', desc: '列车到站广播' },
  { type: 'train_departure', desc: '列车发车广播' },
  { type: 'notice', desc: '通告广播' },
  { type: 'music', desc: '背景音乐' },
];

const BROADCAST_ZONES = [
  { id: 'platform_1', name: '站台1区' },
  { id: 'platform_2', name: '站台2区' },
  { id: 'hall', name: '站厅区' },
  { id: 'entrance', name: '出入口区' },
  { id: 'tunnel', name: '隧道区' },
  { id: 'equipment', name: '设备区' },
  { id: 'all', name: '全区域广播' },
];

const PRIORITY_LEVELS = [
  { level: 1, name: '最高优先级', desc: '紧急疏散' },
  { level: 2, name: '高优先级', desc: '安全警报' },
  { level: 3, name: '中优先级', desc: '运营广播' },
  { level: 4, name: '低优先级', desc: '普通广播' },
  { level: 5, name: '最低优先级', desc: '背景音乐' },
];

const GB28181_COMMANDS = [
  'MESSAGE', 'INVITE', 'BYE', 'CANCEL', 'OPTIONS',
];

const PAGA_STATES = [
  { state: 'idle', desc: '空闲' },
  { state: 'broadcasting', desc: '广播中' },
  { state: 'interrupt', desc: '被打断' },
  { state: 'error', desc: '错误' },
  { state: 'fault', desc: '故障' },
];

function generateBroadcastId() {
  return 'PAS-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

function generateSourceId() {
  return 'SRC-' + Math.floor(Math.random() * 50).toString().padStart(3, '0');
}

/**
 * 解析 GB28181 广播信令
 * GB28181 是中国国家标准，用于视频监控和广播系统互联
 * 基于 SIP 协议，包含 XML 格式的设备描述和控制命令
 */
function parseGB28181() {
  const cmdType = GB28181_COMMANDS[Math.floor(Math.random() * GB28181_COMMANDS.length)];
  const bcastType = BROADCAST_TYPES[Math.floor(Math.random() * BROADCAST_TYPES.length)];
  const zone = BROADCAST_ZONES[Math.floor(Math.random() * BROADCAST_ZONES.length)];
  const priority = PRIORITY_LEVELS[Math.floor(Math.random() * PRIORITY_LEVELS.length)];
  const bcastId = generateBroadcastId();
  const srcId = generateSourceId();
  const seq = Math.floor(Math.random() * 10000);
  const sn = Math.floor(Math.random() * 1000).toString().padStart(10, '0');

  const xmlContent = `<?xml version="1.0" encoding="GB2312"?>
<Query>
<CmdType>BROADCAST</CmdType>
<SN>${sn}</SN>
<DeviceID>${srcId}</DeviceID>
<BroadcastID>${bcastId}</BroadcastID>
<BroadcastType>${bcastType.type}</BroadcastType>
<Zone>${zone.id}</Zone>
<Priority>${priority.level}</Priority>
<StartTime>${new Date().toISOString()}</StartTime>
<Duration>${Math.floor(Math.random() * 300)}</Duration>
</Query>`;

  const rawData = [
    `${cmdType} sip:${bcastId}@${sn}.pas.gov.cn SIP/2.0`,
    `Via: SIP/2.0/UDP 192.168.200.${Math.floor(Math.random() * 254) + 1}:5060;branch=z9hG4bK${crypto.randomBytes(4).toString('hex')}`,
    `From: <sip:${srcId}@pas.gov.cn>;tag=${crypto.randomBytes(4).toString('hex')}`,
    `To: <sip:${bcastId}@pas.gov.cn>`,
    `Call-ID: ${crypto.randomBytes(8).toString('hex')}@pas.gov.cn`,
    `CSeq: ${seq} ${cmdType}`,
    `Content-Type: Application/MANSCDP+xml`,
    `Content-Length: ${Buffer.byteLength(xmlContent)}`,
    '',
    xmlContent,
  ].join('\r\n');

  const parsedData = {
    protocol: 'GB28181',
    version: '2016',
    cmdType,
    broadcastId: bcastId,
    sourceId: srcId,
    broadcastType: bcastType.type,
    broadcastTypeDesc: bcastType.desc,
    zone: zone.id,
    zoneName: zone.name,
    priority: priority.level,
    priorityDesc: priority.desc,
    sequence: seq,
    duration: Math.floor(Math.random() * 300),
    volume: Math.floor(Math.random() * 40) + 60,
  };

  return {
    protocol: 'GB28181',
    rawData: Buffer.from(rawData).toString('base64'),
    parsedData: JSON.stringify(parsedData),
    severity: priority.level <= 2 ? 'critical' : priority.level <= 3 ? 'warning' : 'info',
    direction: 'outgoing',
  };
}

/**
 * 解析 SIP 广播信令
 * 专用广播系统使用的 SIP 信令变种
 */
function parseSIPBroadcast() {
  const bcastType = BROADCAST_TYPES[Math.floor(Math.random() * BROADCAST_TYPES.length)];
  const zone = BROADCAST_ZONES[Math.floor(Math.random() * BROADCAST_ZONES.length)];
  const priority = PRIORITY_LEVELS[Math.floor(Math.random() * PRIORITY_LEVELS.length)];
  const bcastId = generateBroadcastId();
  const srcId = generateSourceId();
  const seq = Math.floor(Math.random() * 10000);

  const rawData = [
    `INVITE sip:${bcastId}@broadcast.local SIP/2.0`,
    `Via: SIP/2.0/UDP 192.168.200.${Math.floor(Math.random() * 254) + 1}:5060;branch=z9hG4bK${crypto.randomBytes(4).toString('hex')}`,
    `From: <sip:${srcId}@broadcast.local>;tag=${crypto.randomBytes(4).toString('hex')}`,
    `To: <sip:${bcastId}@broadcast.local>`,
    `Call-ID: ${crypto.randomBytes(8).toString('hex')}@broadcast.local`,
    `CSeq: ${seq} INVITE`,
    `Contact: <sip:${srcId}@192.168.200.${Math.floor(Math.random() * 254) + 1}:5060>`,
    `Content-Type: application/sdp`,
    `X-Broadcast-Type: ${bcastType.type}`,
    `X-Broadcast-Zone: ${zone.id}`,
    `X-Priority: ${priority.level}`,
    `Content-Length: 0`,
    '',
  ].join('\r\n');

  const parsedData = {
    protocol: 'SIP-Broadcast',
    version: '2.0',
    messageType: 'INVITE',
    broadcastId: bcastId,
    sourceId: srcId,
    broadcastType: bcastType.type,
    broadcastTypeDesc: bcastType.desc,
    zone: zone.id,
    zoneName: zone.name,
    priority: priority.level,
    priorityDesc: priority.desc,
    sequence: seq,
  };

  return {
    protocol: 'SIP-Broadcast',
    rawData: Buffer.from(rawData).toString('base64'),
    parsedData: JSON.stringify(parsedData),
    severity: priority.level <= 2 ? 'critical' : priority.level <= 3 ? 'warning' : 'info',
    direction: 'outgoing',
  };
}

/**
 * 解析 PAGA 广播信令
 * PAGA (Public Address & General Alarm) 是地铁专用广播和警报系统
 */
function parsePAGA() {
  const bcastType = BROADCAST_TYPES[Math.floor(Math.random() * BROADCAST_TYPES.length)];
  const zone = BROADCAST_ZONES[Math.floor(Math.random() * BROADCAST_ZONES.length)];
  const priority = PRIORITY_LEVELS[Math.floor(Math.random() * PRIORITY_LEVELS.length)];
  const state = PAGA_STATES[Math.floor(Math.random() * PAGA_STATES.length)];
  const bcastId = generateBroadcastId();

  const rawHex = [
    'PAGA',                  // 头部标识
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0'),  // 版本
    priority.level.toString(16).padStart(2, '0'),  // 优先级
    zone.id.length.toString(16).padStart(2, '0'),  // 区域长度
    ...Buffer.from(zone.id).map(b => b.toString(16).padStart(2, '0')),
    state.state.length.toString(16).padStart(2, '0'), // 状态长度
    ...Buffer.from(state.state).map(b => b.toString(16).padStart(2, '0')),
  ].join(' ');

  const parsedData = {
    protocol: 'PAGA',
    version: 2,
    broadcastId: bcastId,
    broadcastType: bcastType.type,
    broadcastTypeDesc: bcastType.desc,
    zone: zone.id,
    zoneName: zone.name,
    priority: priority.level,
    priorityDesc: priority.desc,
    state: state.state,
    stateDesc: state.desc,
    amplifierId: 'AMP-' + Math.floor(Math.random() * 20).toString().padStart(2, '0'),
    speakerZone: zone.id,
    volume: Math.floor(Math.random() * 40) + 60,
    broadcastDuration: Math.floor(Math.random() * 300),
  };

  return {
    protocol: 'PAGA',
    rawData: rawHex,
    parsedData: JSON.stringify(parsedData),
    severity: priority.level <= 2 ? 'critical' : priority.level <= 3 ? 'warning' : 'info',
    direction: 'outgoing',
  };
}

/**
 * 随机选择协议并生成广播信令
 */
function generateSignal() {
  const protocols = ['GB28181', 'SIP-Broadcast', 'PAGA'];
  const proto = protocols[Math.floor(Math.random() * protocols.length)];

  switch (proto) {
    case 'GB28181': return parseGB28181();
    case 'SIP-Broadcast': return parseSIPBroadcast();
    case 'PAGA': return parsePAGA();
    default: return parseGB28181();
  }
}

module.exports = {
  parseGB28181,
  parseSIPBroadcast,
  parsePAGA,
  generateSignal,
};