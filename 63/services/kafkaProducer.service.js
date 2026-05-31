const { Kafka, Partitioners } = require('kafkajs');
const { config } = require('../config');
const logger = require('../utils/logger');

class KafkaProducerService {
  constructor() {
    this.kafka = null;
    this.producer = null;
    this.isConnected = false;
    this.init();
  }

  init() {
    try {
      this.kafka = new Kafka({
        clientId: config.kafka.clientId,
        brokers: config.kafka.brokers,
        retry: {
          initialRetryTime: 100,
          retries: 8
        }
      });

      this.producer = this.kafka.producer({
        createPartitioner: Partitioners.LegacyPartitioner,
        allowAutoTopicCreation: true,
        transactionTimeout: 30000
      });

      this.connect();
    } catch (err) {
      logger.error('Failed to initialize Kafka producer:', err);
    }
  }

  async connect() {
    try {
      await this.producer.connect();
      this.isConnected = true;
      logger.info('Kafka producer connected successfully');
    } catch (err) {
      logger.error('Failed to connect Kafka producer:', err);
      this.isConnected = false;
      setTimeout(() => this.connect(), 5000);
    }
  }

  async disconnect() {
    try {
      if (this.producer) {
        await this.producer.disconnect();
        this.isConnected = false;
        logger.info('Kafka producer disconnected');
      }
    } catch (err) {
      logger.error('Failed to disconnect Kafka producer:', err);
    }
  }

  async sendRawData(data) {
    return this.sendMessage(config.kafka.rawDataTopic, data);
  }

  async sendAlert(alert) {
    return this.sendMessage(config.kafka.alertTopic, alert, alert.level);
  }

  async sendMessage(topic, message, key = null, maxRetries = 3) {
    if (!this.isConnected) {
      logger.warn('Kafka producer not connected, queueing message');
      return this.queueMessage(topic, message, key);
    }

    let retries = 0;
    let lastError = null;

    while (retries < maxRetries) {
      try {
        const kafkaMessage = {
          value: JSON.stringify(message),
          timestamp: Date.now().toString()
        };

        if (key) {
          kafkaMessage.key = key;
        }

        const result = await this.producer.send({
          topic,
          messages: [kafkaMessage],
          acks: -1
        });

        if (retries > 0) {
          logger.debug(`Message sent to topic ${topic} after ${retries} retries:`, result[0]);
        } else {
          logger.debug(`Message sent to topic ${topic}:`, result[0]);
        }
        return result[0];
      } catch (err) {
        lastError = err;
        retries++;
        logger.warn(`Failed to send message to topic ${topic} (attempt ${retries}/${maxRetries}):`, err.message);
        
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retries * 500));
        }
      }
    }

    logger.error(`Failed to send message to topic ${topic} after ${maxRetries} attempts:`, lastError);
    return this.queueMessage(topic, message, key);
  }

  async sendBatch(topic, messages, maxRetries = 3) {
    if (!this.isConnected) {
      logger.warn('Kafka producer not connected, queueing batch');
      return null;
    }

    let retries = 0;
    let lastError = null;

    while (retries < maxRetries) {
      try {
        const kafkaMessages = messages.map(msg => ({
          value: JSON.stringify(msg.value),
          key: msg.key || null,
          timestamp: Date.now().toString()
        }));

        const result = await this.producer.send({
          topic,
          messages: kafkaMessages,
          acks: -1
        });

        logger.debug(`Batch of ${messages.length} messages sent to topic ${topic}, retries: ${retries}`);
        return result;
      } catch (err) {
        lastError = err;
        retries++;
        logger.warn(`Failed to send batch to topic ${topic} (attempt ${retries}/${maxRetries}):`, err.message);
        
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retries * 1000));
        }
      }
    }

    logger.error(`Failed to send batch to topic ${topic} after ${maxRetries} attempts:`, lastError);
    return null;
  }

  async sendRawDataBatch(records) {
    const messages = records.map(record => ({
      value: record,
      key: record.deviceId
    }));
    return this.sendBatch(config.kafka.rawDataTopic, messages);
  }

  async sendAlertBatch(alerts) {
    const messages = alerts.map(alert => ({
      value: alert,
      key: alert.level
    }));
    return this.sendBatch(config.kafka.alertTopic, messages);
  }

  queueMessage(topic, message, key) {
    logger.debug(`Message queued for topic ${topic}`);
    return {
      status: 'queued',
      topic,
      message,
      key,
      queuedAt: Date.now()
    };
  }
}

module.exports = new KafkaProducerService();
