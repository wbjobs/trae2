/**
 * 门禁信令协议解析器 (ACS - Access Control System)
 * 处理地铁门禁系统信令，包括:
 * - Wiegand 协议 (韦根协议, 门禁主流协议)
 * - RS485 总线协议
 * - OSDP (Open Supervised Device Protocol)
 * - TCP/IP 门禁控制器协议
 */

const crypto = require('crypto');

const CARD_TYPES = [
  { type: 'IC', desc: 'IC卡' },
  { type: 'Mifare', desc: 'Mifare射频卡' },
  { type: 'CPU', desc: 'CPU卡' },
  { type: 'QR', desc: '二维码' },
  { type: 'Face', desc: '人脸识别' },
  { type: 'Fingerprint', desc: '指纹识别' },
];

const DOOR_TYPES = [
  { id: 'station_entrance', name: '车站出入口' },
  { id: 'equipment_room', name: '设备机房门' },
  { id: 'control_room', name: '控制室门' },
  { id: 'staff_channel', name: '员工通道' },
  { id: 'emergency_exit', name: '应急出口' },
];

const DOOR_STATES = [
  { state: 'open', desc: '开门' },
  { state: 'closed', desc: '关门' },
  { state: 'forced', desc: '强制开门' },
  { state: 'held', desc: '门长时间未关' },
  { state: 'locked', desc: '锁定' },
];

const ACCESS_RESULTS = [
  { result: 'granted', desc: '授权通过', severity: 'info' },
  { result: 'denied', desc: '拒绝通过', severity: 'warning' },
  { result: 'unknown_card', desc: '未知卡号', severity: 'warning' },
  { result: 'expired', desc: '权限过期', severity: 'warning' },
  { result: 'anti_passback', desc: '防潜回触发', severity: 'info' },
  { result: 'duress', desc: '胁迫码触发', severity: 'critical' },
];

function generateCardNumber() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateDoorId() {
  return 'ACS-' + Math.floor(100000 + Math.random() * 899999);
}

function generateControllerId() {
  return 'CTRL-' + Math.floor(Math.random() * 100).toString().padStart(3, '0');
}

/**
 * 解析 Wiegand 26/34 门禁信令
 * Wiegand是门禁行业标准协议，26位/34位格式
 * 格式: 1位起始位 + 8位企业码 + 16位卡号 + 1位校验位
 */
function parseWiegand() {
  const is34bit = Math.random() > 0.5;
  const facilityCode = Math.floor(Math.random() * 256);
  const cardNumber = Math.floor(Math.random() * 65536);
  const cardType = CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)];
  const door = DOOR_TYPES[Math.floor(Math.random() * DOOR_TYPES.length)];
  const accessResult = ACCESS_RESULTS[Math.floor(Math.random() * ACCESS_RESULTS.length)];
  const timestamp = Date.now();

  const facilityBin = facilityCode.toString(2).padStart(8, '0');
  const cardBin = cardNumber.toString(2).padStart(16, '0');
  const rawBinary = '1' + facilityBin + cardBin + '0';

  const rawHex = [];
  for (let i = 0; i < rawBinary.length; i += 4) {
    rawHex.push(parseInt(rawBinary.substr(i, 4), 2).toString(16).toUpperCase());
  }

  const parsedData = {
    protocol: 'Wiegand',
    bitLength: is34bit ? 34 : 26,
    facilityCode,
    cardNumber: cardNumber.toString().padStart(5, '0'),
    cardType: cardType.type,
    cardTypeDesc: cardType.desc,
    doorId: generateDoorId(),
    doorType: door.name,
    controllerId: generateControllerId(),
    accessResult: accessResult.result,
    accessResultDesc: accessResult.desc,
    readerId: 'RD-' + Math.floor(Math.random() * 20).toString().padStart(2, '0'),
    timestamp,
  };

  return {
    protocol: 'Wiegand',
    rawData: rawHex.join(''),
    parsedData: JSON.stringify(parsedData),
    severity: accessResult.severity,
    direction: accessResult.result === 'granted' ? 'incoming' : 'incoming',
  };
}

/**
 * 解析 RS485 门禁信令
 * RS485 是工业总线标准，常用于门禁控制器之间通信
 * 报文格式: 地址码(1B) + 功能码(1B) + 数据(NB) + CRC校验(2B)
 */
function parseRS485() {
  const slaveAddr = Math.floor(Math.random() * 247) + 1;
  const functionCode = [0x03, 0x06, 0x10][Math.floor(Math.random() * 3)];
  const door = DOOR_TYPES[Math.floor(Math.random() * DOOR_TYPES.length)];
  const doorState = DOOR_STATES[Math.floor(Math.random() * DOOR_STATES.length)];
  const accessResult = ACCESS_RESULTS[Math.floor(Math.random() * ACCESS_RESULTS.length)];

  const dataBytes = [];
  for (let i = 0; i < 8; i++) {
    dataBytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase());
  }

  const crc = crypto.randomBytes(2).toString('hex').toUpperCase();

  const rawHex = [
    slaveAddr.toString(16).padStart(2, '0').toUpperCase(),
    functionCode.toString(16).padStart(2, '0').toUpperCase(),
    ...dataBytes,
    crc,
  ].join(' ');

  const parsedData = {
    protocol: 'RS485',
    baudRate: 9600,
    slaveAddress: slaveAddr,
    functionCode: `0x${functionCode.toString(16).padStart(2, '0').toUpperCase()}`,
    functionDesc: functionCode === 0x03 ? '读寄存器' : functionCode === 0x06 ? '写单寄存器' : '写多寄存器',
    doorId: generateDoorId(),
    doorType: door.name,
    doorState: doorState.state,
    doorStateDesc: doorState.desc,
    controllerId: generateControllerId(),
    accessResult: accessResult.result,
    accessResultDesc: accessResult.desc,
    cardNumber: generateCardNumber(),
  };

  return {
    protocol: 'RS485',
    rawData: rawHex,
    parsedData: JSON.stringify(parsedData),
    severity: accessResult.severity,
    direction: 'bidirectional',
  };
}

/**
 * 解析 OSDP 门禁信令
 * OSDP (Open Supervised Device Protocol) 是门禁设备通信标准
 */
function parseOSDP() {
  const address = Math.floor(Math.random() * 126);
  const seq = Math.floor(Math.random() * 4);
  const command = ['poll', 'idreport', 'led', 'buzzer', 'text', 'output', 'comset', 'bioread'][Math.floor(Math.random() * 8)];
  const door = DOOR_TYPES[Math.floor(Math.random() * DOOR_TYPES.length)];
  const accessResult = ACCESS_RESULTS[Math.floor(Math.random() * ACCESS_RESULTS.length)];

  const rawHex = [
    'FF',                    // OSDP 起始符
    address.toString(16).padStart(2, '0').toUpperCase(),
    '04',                    // 长度
    (0x60 + seq).toString(16).toUpperCase(), // 控制码
    '00',                    // 类型
    '00',                    // 数据
  ].join(' ');

  const parsedData = {
    protocol: 'OSDP',
    version: 2,
    address,
    sequence: seq,
    command,
    commandDesc: command === 'poll' ? '轮询' : command === 'idreport' ? 'ID报告' : command === 'led' ? 'LED控制' : command === 'buzzer' ? '蜂鸣器' : command === 'text' ? '文本输出' : command === 'output' ? '输出控制' : command === 'comset' ? '通信配置' : '生物识别',
    doorId: generateDoorId(),
    doorType: door.name,
    controllerId: generateControllerId(),
    accessResult: accessResult.result,
    accessResultDesc: accessResult.desc,
    cardNumber: generateCardNumber(),
  };

  return {
    protocol: 'OSDP',
    rawData: rawHex,
    parsedData: JSON.stringify(parsedData),
    severity: accessResult.severity,
    direction: 'bidirectional',
  };
}

/**
 * 随机选择协议并生成门禁信令
 */
function generateSignal() {
  const protocols = ['Wiegand', 'RS485', 'OSDP'];
  const proto = protocols[Math.floor(Math.random() * protocols.length)];

  switch (proto) {
    case 'Wiegand': return parseWiegand();
    case 'RS485': return parseRS485();
    case 'OSDP': return parseOSDP();
    default: return parseWiegand();
  }
}

module.exports = {
  parseWiegand,
  parseRS485,
  parseOSDP,
  generateSignal,
};