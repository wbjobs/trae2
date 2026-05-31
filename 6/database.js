const mongoose = require('mongoose');
const config = require('./config');

const eventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  blockNumber: { type: Number, required: true, index: true },
  transactionHash: { type: String, required: true, index: true },
  logIndex: { type: Number, required: true },
  contractAddress: { type: String, required: true, index: true },
  eventName: { type: String, required: true, index: true },
  returnValues: { type: mongoose.Schema.Types.Mixed, required: true },
  raw: { type: String },
  timestamp: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

eventSchema.index({ blockNumber: 1, logIndex: 1 }, { unique: true });
eventSchema.index({ contractAddress: 1, eventName: 1 });

const Event = mongoose.model('Event', eventSchema);

class Database {
  constructor() {
    this.connection = null;
  }

  async connect() {
    try {
      await mongoose.connect(config.database.mongodbUri);
      this.connection = mongoose.connection;
      console.log('[Database] MongoDB connected successfully');
    } catch (error) {
      console.error('[Database] MongoDB connection error:', error);
      throw error;
    }
  }

  async saveEvent(parsedEvent) {
    try {
      const event = new Event(parsedEvent);
      await event.save();
      return event;
    } catch (error) {
      if (error.code === 11000) {
        console.log(`[Database] Event already exists: ${parsedEvent.eventId}`);
        return await Event.findOne({ eventId: parsedEvent.eventId });
      }
      console.error('[Database] Error saving event:', error);
      throw error;
    }
  }

  async saveEvents(parsedEvents) {
    const results = [];
    for (const event of parsedEvents) {
      try {
        const result = await this.saveEvent(event);
        results.push(result);
      } catch (error) {
        console.error('[Database] Error saving event batch:', error);
      }
    }
    return results;
  }

  async getEventByEventId(eventId) {
    return await Event.findOne({ eventId });
  }

  async getEventsByContract(contractAddress, limit = 100) {
    return await Event.find({ contractAddress: contractAddress.toLowerCase() })
      .sort({ blockNumber: -1, logIndex: -1 })
      .limit(limit);
  }

  async getEventsByEventName(eventName, limit = 100) {
    return await Event.find({ eventName })
      .sort({ blockNumber: -1, logIndex: -1 })
      .limit(limit);
  }

  async getEventsByBlockRange(fromBlock, toBlock) {
    return await Event.find({
      blockNumber: { $gte: fromBlock, $lte: toBlock },
    }).sort({ blockNumber: 1, logIndex: 1 });
  }

  async getLatestBlockNumber() {
    const latest = await Event.findOne().sort({ blockNumber: -1 });
    return latest ? latest.blockNumber : 0;
  }

  async disconnect() {
    if (this.connection) {
      await mongoose.disconnect();
      console.log('[Database] MongoDB disconnected');
    }
  }
}

module.exports = Database;
