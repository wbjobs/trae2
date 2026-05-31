/**
 * 信令订阅服务
 * 
 * 功能:
 * - 订阅信令接收服务(3001端口)的 WebSocket
 * - 实时接收信令数据进行链路分析
 * - 当信令服务不可用时，启用本地模拟信令生成
 */

const WebSocket = require('ws');
const cron = require('node-cron');

const SIGNALING_WS_URL = 'ws://localhost:3001/ws';
const RECONNECT_DELAY = 5000;
const SIMULATION_INTERVAL = 2000;

class SignalSubscriber {
  constructor(analyzer, onAbnormalUpdate) {
    this.analyzer = analyzer;
    this.onAbnormalUpdate = onAbnormalUpdate;
    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.simulationTimer = null;
    this.useSimulation = false;
  }

  /**
   * 启动订阅服务
   */
  start() {
    console.log('[Subscriber] 启动信令订阅服务...');
    this.connect();
  }

  /**
   * 连接到信令服务 WebSocket
   */
  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log('[Subscriber] 正在连接信令服务:', SIGNALING_WS_URL);

    try {
      this.ws = new WebSocket(SIGNALING_WS_URL);

      this.ws.on('open', () => {
        this.isConnected = true;
        this.useSimulation = false;
        this.stopSimulation();
        console.log('[Subscriber] 已连接到信令服务');
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', () => {
        this.isConnected = false;
        console.log('[Subscriber] 与信令服务的连接已断开');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        console.error('[Subscriber] WebSocket 错误:', err.message);
        this.isConnected = false;
        if (!this.useSimulation) {
          this.useSimulation = true;
          this.startSimulation();
        }
      });
    } catch (err) {
      console.error('[Subscriber] 连接失败:', err.message);
      this.useSimulation = true;
      this.startSimulation();
      this.scheduleReconnect();
    }
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'signal') {
        this.processSignal(message.data);
      } else if (message.type === 'linkStatusChange') {
        this.processLinkStatusChange(message.data);
      }
    } catch (err) {
      console.error('[Subscriber] 消息解析失败:', err.message);
    }
  }

  /**
   * 处理信令数据
   */
  processSignal(signal) {
    if (!signal || !signal.src_station || !signal.dst_station) {
      return;
    }

    const link = this.findLinkByStations(signal.src_station, signal.dst_station);
    if (!link) {
      return;
    }

    const sample = this.signalToSample(signal, link);
    this.analyzer.addSample(link.id, sample);

    const changes = this.analyzer.detectAbnormalChanges();
    if (changes.newlyAbnormal.length > 0 || changes.newlyRecovered.length > 0) {
      if (this.onAbnormalUpdate) {
        this.onAbnormalUpdate(changes);
      }
    }
  }

  /**
   * 处理链路状态变化
   */
  processLinkStatusChange(linkChange) {
    if (!linkChange || !linkChange.link_id) {
      return;
    }

    const link = this.analyzer.links.find(l => l.id === linkChange.link_id);
    if (!link) {
      return;
    }

    const sample = {
      latency: linkChange.latency !== undefined ? linkChange.latency : link.current_latency,
      packet_loss: linkChange.packet_loss !== undefined ? linkChange.packet_loss : link.current_packet_loss,
      timestamp: new Date().toISOString(),
    };

    this.analyzer.addSample(link.id, sample);

    const changes = this.analyzer.detectAbnormalChanges();
    if (changes.newlyAbnormal.length > 0 || changes.newlyRecovered.length > 0) {
      if (this.onAbnormalUpdate) {
        this.onAbnormalUpdate(changes);
      }
    }
  }

  /**
   * 将信令数据转换为样本数据
   */
  signalToSample(signal, link) {
    const baseLatency = link.current_latency || (Math.random() * 30 + 5);

    const latencyVariation = (Math.random() - 0.5) * 20;
    const latency = Math.max(1, baseLatency + latencyVariation);

    const lossVariation = Math.random() * 0.3;
    const packetLoss = Math.max(0, link.current_packet_loss + lossVariation - 0.1);

    return {
      latency,
      packet_loss: packetLoss,
      timestamp: signal.timestamp || new Date().toISOString(),
    };
  }

  /**
   * 根据站点查找链路
   */
  findLinkByStations(srcStation, dstStation) {
    return this.analyzer.links.find(
      link => link.src_station === srcStation && link.dst_station === dstStation
    );
  }

  /**
   * 安排重连
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY);
  }

  /**
   * 启动本地模拟信令生成
   */
  startSimulation() {
    if (this.simulationTimer) {
      return;
    }

    console.log('[Subscriber] 启动本地模拟信令生成（信令服务不可用）');

    this.simulationTimer = setInterval(() => {
      this.generateSimulationSample();
    }, SIMULATION_INTERVAL);
  }

  /**
   * 停止本地模拟信令生成
   */
  stopSimulation() {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
      console.log('[Subscriber] 已停止本地模拟信令生成');
    }
  }

  /**
   * 生成模拟样本数据
   */
  generateSimulationSample() {
    const links = this.analyzer.links;
    if (links.length === 0) {
      return;
    }

    const randomLink = links[Math.floor(Math.random() * links.length)];
    const sample = this.analyzer.generateSample(randomLink);

    this.analyzer.addSample(randomLink.id, sample);

    const changes = this.analyzer.detectAbnormalChanges();
    if ((changes.newlyAbnormal.length > 0 || changes.newlyRecovered.length > 0) && this.onAbnormalUpdate) {
      this.onAbnormalUpdate(changes);
    }
  }

  /**
   * 停止订阅服务
   */
  stop() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (err) {
        console.error('[Subscriber] 关闭 WebSocket 失败:', err.message);
      }
      this.ws = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopSimulation();
    this.isConnected = false;

    console.log('[Subscriber] 订阅服务已停止');
  }
}

module.exports = SignalSubscriber;
