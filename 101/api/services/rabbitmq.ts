import type { Channel, ConsumeMessage, Connection } from 'amqplib'

type ExchangeKey = 'CMD' | 'EVT' | 'ALERT'

const EXCHANGE_NAMES: Record<ExchangeKey, string> = {
  CMD: 'signal.cmd.exchange',
  EVT: 'signal.evt.exchange',
  ALERT: 'signal.alert.exchange',
}

const EXCHANGES = {
  CMD: 'CMD',
  EVT: 'EVT',
  ALERT: 'ALERT',
} as const

const QUEUES = {
  ROUTE_CMD: 'route.command',
  COLLECT_CMD: 'collect.command',
  INTERCEPT_CMD: 'intercept.command',
  SIGNAL_EVT: 'signal.event',
  ALERT_EVT: 'alert.event',
} as const

export interface MQMessage {
  type: string
  payload: unknown
  timestamp: string
}

export class RabbitMQService {
  private connection: Connection | null = null
  private channel: Channel | null = null
  private useMock: boolean = true
  private messageHandlers: Map<string, Set<(msg: MQMessage) => void>> = new Map()

  async init() {
    try {
      const amqp = await import('amqplib')
      const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672'

      const conn = await amqp.connect(url)
      this.connection = conn as unknown as Connection
      this.channel = await (conn as unknown as { createChannel: () => Promise<Channel> }).createChannel()

      await this.channel!.assertExchange(EXCHANGE_NAMES.CMD, 'topic', { durable: true })
      await this.channel!.assertExchange(EXCHANGE_NAMES.EVT, 'topic', { durable: true })
      await this.channel!.assertExchange(EXCHANGE_NAMES.ALERT, 'topic', { durable: true })

      await this.channel!.assertQueue(QUEUES.ROUTE_CMD, { durable: true })
      await this.channel!.assertQueue(QUEUES.COLLECT_CMD, { durable: true })
      await this.channel!.assertQueue(QUEUES.INTERCEPT_CMD, { durable: true })
      await this.channel!.assertQueue(QUEUES.SIGNAL_EVT, { durable: true })
      await this.channel!.assertQueue(QUEUES.ALERT_EVT, { durable: true })

      await this.channel!.bindQueue(QUEUES.ROUTE_CMD, EXCHANGE_NAMES.CMD, 'route.#')
      await this.channel!.bindQueue(QUEUES.COLLECT_CMD, EXCHANGE_NAMES.CMD, 'collect.#')
      await this.channel!.bindQueue(QUEUES.INTERCEPT_CMD, EXCHANGE_NAMES.CMD, 'intercept.#')
      await this.channel!.bindQueue(QUEUES.SIGNAL_EVT, EXCHANGE_NAMES.EVT, 'signal.#')
      await this.channel!.bindQueue(QUEUES.ALERT_EVT, EXCHANGE_NAMES.ALERT, 'alert.#')

      this.useMock = false
      console.log('[RabbitMQ] Connected successfully')

      this.startConsumers()
    } catch (e: unknown) {
      console.log('[RabbitMQ] Service not available, using mock mode')
      this.useMock = true
    }
  }

  private startConsumers() {
    if (!this.channel) return

    const queues = [QUEUES.ROUTE_CMD, QUEUES.COLLECT_CMD, QUEUES.INTERCEPT_CMD, QUEUES.SIGNAL_EVT, QUEUES.ALERT_EVT]
    queues.forEach((queue) => {
      this.channel!.consume(queue, (msg) => this.handleMessage(queue, msg), { noAck: true })
    })
  }

  private handleMessage(queue: string, msg: ConsumeMessage | null) {
    if (!msg) return
    try {
      const content: MQMessage = JSON.parse(msg.content.toString())
      const handlers = this.messageHandlers.get(queue)
      if (handlers) {
        handlers.forEach((handler) => handler(content))
      }
    } catch (e: unknown) {
      console.error('[RabbitMQ] Parse error:', e)
    }
  }

  async publish(exchange: ExchangeKey, routingKey: string, message: MQMessage) {
    const msg = {
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
    }

    if (this.useMock || !this.channel) {
      setTimeout(() => {
        let queue: string | null = null
        if (routingKey.startsWith('route.')) queue = QUEUES.ROUTE_CMD
        else if (routingKey.startsWith('collect.')) queue = QUEUES.COLLECT_CMD
        else if (routingKey.startsWith('intercept.')) queue = QUEUES.INTERCEPT_CMD
        else if (routingKey.startsWith('signal.')) queue = QUEUES.SIGNAL_EVT
        else if (routingKey.startsWith('alert.')) queue = QUEUES.ALERT_EVT

        if (queue) {
          const handlers = this.messageHandlers.get(queue)
          if (handlers) {
            handlers.forEach((handler) => handler(msg))
          }
        }
      }, 50)
      return
    }

    try {
      this.channel!.publish(
        EXCHANGE_NAMES[exchange],
        routingKey,
        Buffer.from(JSON.stringify(msg)),
        { persistent: true }
      )
    } catch (e: unknown) {
      console.error('[RabbitMQ] Publish error:', e)
    }
  }

  subscribe(queue: string, handler: (msg: MQMessage) => void) {
    if (!this.messageHandlers.has(queue)) {
      this.messageHandlers.set(queue, new Set())
    }
    this.messageHandlers.get(queue)!.add(handler)
    return () => {
      this.messageHandlers.get(queue)?.delete(handler)
    }
  }

  isMockMode(): boolean {
    return this.useMock
  }

  async close() {
    if (this.channel) await this.channel.close()
    if (this.connection) await (this.connection as unknown as { close: () => Promise<void> }).close()
  }
}

export const rabbitMQ = new RabbitMQService()
export { EXCHANGES, QUEUES }
