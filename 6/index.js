const BlockCache = require('./cache');
const BlockchainListener = require('./blockchain-listener');
const EventParser = require('./event-parser');
const Database = require('./database');
const AlertPusher = require('./alert-pusher');
const config = require('./config');

const ERC20_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'from', type: 'address' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'owner', type: 'address' },
      { indexed: true, internalType: 'address', name: 'spender', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'Approval',
    type: 'event',
  },
];

const CONTRACT_CONFIGS = [
  // {
  //   address: '0x...',
  //   name: 'USDC',
  //   abi: ERC20_ABI,
  // },
];

class ContractListenerService {
  constructor() {
    this.cache = new BlockCache();
    this.listener = new BlockchainListener(this.cache);
    this.parser = new EventParser();
    this.database = new Database();
    this.alerter = new AlertPusher();
    this.isRunning = false;
  }

  async init() {
    console.log('[Service] Initializing contract listener service...');

    await this.cache.connect();
    await this.database.connect();

    const contracts = config.contracts;
    if (contracts.length === 0) {
      console.warn('[Service] No contract addresses configured. Add contracts via CONTRACT_ADDRESSES env var or CONTRACT_CONFIGS.');
    } else {
      for (const address of contracts) {
        const trimmed = address.trim();
        if (trimmed) {
          this.listener.addContract(trimmed, ERC20_ABI);
          console.log(`[Service] Added contract: ${trimmed}`);
        }
      }
    }

    for (const contractCfg of CONTRACT_CONFIGS) {
      if (contractCfg && contractCfg.address) {
        this.listener.addContract(
          contractCfg.address,
          contractCfg.abi || ERC20_ABI,
          contractCfg.name
        );
        console.log(`[Service] Added configured contract: ${contractCfg.name || contractCfg.address}`);
      }
    }

    this.registerEventHandlers();
    this.registerAlertRules();

    console.log('[Service] Initialization complete');
    this._printStats();
  }

  _printStats() {
    console.log('\n========== Service Stats ==========');
    console.log(`  Contracts:     ${this.listener.contracts.size}`);
    console.log(`  Concurrency:   ${this.listener.concurrencyLimit}`);
    console.log(`  Max range:     ${config.blockchain.maxBlockRange} blocks`);
    console.log(`  Confirmations: ${config.blockchain.confirmations}`);
    console.log(`  Poll interval: ${config.blockchain.pollInterval / 1000}s`);
    console.log(`  Alert rules:   ${this.alerter.listRules().filter(r => r.enabled).length} enabled`);
    console.log(`  Alert enabled: ${config.alert.enabled}`);
    console.log('==================================\n');
  }

  registerEventHandlers() {
    this.parser.registerHandler('Transfer', async (event) => {
      const from = event.returnValues.from || event.returnValues[0] || 'unknown';
      const to = event.returnValues.to || event.returnValues[1] || 'unknown';
      const value = event.returnValues.value || event.returnValues[2] || '0';
      console.log(`[Handler] Transfer: ${from} -> ${to}: ${value}`);
    });

    this.parser.registerHandler('Approval', async (event) => {
      const owner = event.returnValues.owner || event.returnValues[0] || 'unknown';
      const spender = event.returnValues.spender || event.returnValues[1] || 'unknown';
      const value = event.returnValues.value || event.returnValues[2] || '0';
      console.log(`[Handler] Approval: ${owner} approved ${spender} for ${value}`);
    });
  }

  registerAlertRules() {
    this.alerter.addRule('large_transfer_warning', {
      type: 'amountThreshold',
      enabled: true,
      severity: 'warning',
      description: 'Transfer amount >= 10000 tokens',
      condition: {
        field: 'returnValues.value',
        min: 10000,
        decimals: 18,
      },
      messageTemplate: '💰 Large Transfer: {{returnValues.value}} tokens from {{returnValues.from}} to {{returnValues.to}}',
    });

    this.alerter.addRule('critical_transfer', {
      type: 'amountThreshold',
      enabled: true,
      severity: 'critical',
      description: 'Transfer amount >= 1,000,000 tokens',
      condition: {
        field: 'returnValues.value',
        min: 1000000,
        decimals: 18,
      },
      messageTemplate: '🔴 CRITICAL Transfer: {{returnValues.value}} tokens from {{returnValues.from}} to {{returnValues.to}}',
    });

    console.log('[Service] Custom alert rules registered');
  }

  async processEvents(events) {
    console.log(`[Service] Processing ${events.length} events...`);

    let parsedEvents;
    try {
      parsedEvents = await this.parser.parseEvents(events);
    } catch (error) {
      console.error('[Service] Error parsing events:', error);
      return;
    }

    if (parsedEvents.length === 0) {
      console.log('[Service] No events parsed');
      return;
    }

    let processedCount = 0;
    let failedCount = 0;
    let alertCount = 0;

    for (const event of parsedEvents) {
      try {
        const isProcessed = await this.cache.isEventProcessed(event.eventId);
        if (isProcessed) {
          continue;
        }

        await this.database.saveEvent(event);

        const alerted = await this.alerter.sendAlert(event);
        if (alerted) alertCount++;

        await this.cache.markEventProcessed(event.eventId);

        processedCount++;
      } catch (error) {
        failedCount++;
        console.error(`[Service] Error processing event ${event.eventId}:`, error.message);
      }
    }

    console.log(`[Service] Processed ${processedCount} events, ${alertCount} alerts, ${failedCount} failed`);
  }

  async start() {
    if (this.isRunning) {
      console.log('[Service] Service is already running');
      return;
    }

    await this.init();

    const lastBlock = await this.cache.getLastProcessedBlock();
    console.log(`[Service] Starting from block: ${lastBlock}`);

    this.listener.start(async (events) => {
      try {
        await this.processEvents(events);
      } catch (error) {
        console.error('[Service] Error in event processing callback:', error);
      }
    });

    this.isRunning = true;
    console.log('[Service] Contract listener service started');

    await this.alerter.sendCustomAlert(
      'Service Started',
      'Ethereum contract listener service has started successfully.',
      {
        'Start Block': lastBlock.toString(),
        'Contracts': this.listener.contracts.size.toString(),
        'Concurrency': this.listener.concurrencyLimit.toString(),
        'Confirmations': config.blockchain.confirmations.toString(),
      },
      'info'
    );
  }

  async stop() {
    console.log('[Service] Stopping contract listener service...');

    this.listener.stop();

    try {
      await this.cache.disconnect();
    } catch (e) {
      console.error('[Service] Error disconnecting cache:', e.message);
    }

    try {
      await this.database.disconnect();
    } catch (e) {
      console.error('[Service] Error disconnecting database:', e.message);
    }

    this.isRunning = false;
    console.log('[Service] Contract listener service stopped');
  }

  addContract(address, abi, name = null) {
    this.listener.addContract(address, abi, name);
    console.log(`[Service] Added contract: ${name || address}`);
  }

  registerEventHandler(eventName, handler) {
    this.parser.registerHandler(eventName, handler);
    console.log(`[Service] Registered handler for event: ${eventName}`);
  }

  addAlertRule(name, config) {
    this.alerter.addRule(name, config);
    console.log(`[Service] Added alert rule: ${name}`);
  }

  listAlertRules() {
    return this.alerter.listRules();
  }
}

async function main() {
  const service = new ContractListenerService();

  process.on('SIGINT', async () => {
    console.log('\n[Service] Received SIGINT, shutting down...');
    await service.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[Service] Received SIGTERM, shutting down...');
    await service.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    console.error('[Service] Uncaught exception:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Service] Unhandled rejection at:', promise, 'reason:', reason);
  });

  try {
    await service.start();
  } catch (error) {
    console.error('[Service] Failed to start service:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  ContractListenerService,
  BlockCache,
  BlockchainListener,
  EventParser,
  Database,
  AlertPusher,
};
