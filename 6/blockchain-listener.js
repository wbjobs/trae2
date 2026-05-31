const { Web3 } = require('web3');
const config = require('./config');

class BlockchainListener {
  constructor(cache) {
    this.web3 = new Web3(config.blockchain.rpcUrl);
    this.cache = cache;
    this.contracts = new Map();
    this.isRunning = false;
    this.isProcessing = false;
    this.maxRetry = 3;
    this.concurrencyLimit = config.blockchain.concurrency || 3;
  }

  addContract(address, abi, name = null) {
    const checksumAddress = this.web3.utils.toChecksumAddress(address);
    const contract = new this.web3.eth.Contract(abi, checksumAddress);
    this.contracts.set(address.toLowerCase(), {
      contract,
      abi,
      checksumAddress,
      name: name || address.slice(0, 8),
    });
  }

  async getCurrentBlock() {
    return await this.web3.eth.getBlockNumber();
  }

  async getBlock(blockNumber) {
    return await this.web3.eth.getBlock(blockNumber, true);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchPastEventsForContract(address, contractInfo, fromBlock, toBlock, retries = 0) {
    const allEvents = [];
    let currentFrom = fromBlock;
    let currentMaxRange = config.blockchain.maxBlockRange;

    while (currentFrom <= toBlock) {
      const chunkEnd = Math.min(currentFrom + currentMaxRange - 1, toBlock);

      try {
        const events = await contractInfo.contract.getPastEvents('allEvents', {
          fromBlock: currentFrom,
          toBlock: chunkEnd,
        });

        for (const event of events) {
          event.contractAddress = address.toLowerCase();
          event.contractName = contractInfo.name;
          allEvents.push(event);
        }

        currentFrom = chunkEnd + 1;
      } catch (error) {
        console.error(`[Listener] Error fetching ${contractInfo.name} at blocks ${currentFrom}-${chunkEnd}:`, error.message);

        if (error.message && (
          error.message.includes('Log response size exceeded') ||
          error.message.includes('query returned more than') ||
          error.message.includes('too many results')
        )) {
          currentMaxRange = Math.max(10, Math.floor(currentMaxRange / 2));
          console.log(`[Listener] Reduced block range to ${currentMaxRange} for ${contractInfo.name}`);
          continue;
        }

        if (retries < this.maxRetry) {
          const delay = Math.min(5000 * (retries + 1), 30000);
          console.log(`[Listener] Retry ${retries + 1}/${this.maxRetry} in ${delay / 1000}s...`);
          await this.sleep(delay);
          return await this.fetchPastEventsForContract(address, contractInfo, currentFrom, toBlock, retries + 1);
        }

        console.error(`[Listener] Max retries exceeded for blocks ${currentFrom}-${chunkEnd}, marking as processed`);
        currentFrom = chunkEnd + 1;
        currentMaxRange = config.blockchain.maxBlockRange;
      }
    }

    return allEvents;
  }

  async fetchPastEventsConcurrent(fromBlock, toBlock) {
    const contractEntries = Array.from(this.contracts.entries());
    const results = [];
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < contractEntries.length) {
        const index = currentIndex++;
        const [address, contractInfo] = contractEntries[index];

        try {
          console.log(`[Listener] [${index + 1}/${contractEntries.length}] Fetching ${contractInfo.name}...`);
          const events = await this.fetchPastEventsForContract(address, contractInfo, fromBlock, toBlock);
          console.log(`[Listener] [${index + 1}/${contractEntries.length}] ${contractInfo.name}: ${events.length} events`);
          results.push(...events);
        } catch (error) {
          console.error(`[Listener] [${index + 1}/${contractEntries.length}] Error for ${contractInfo.name}:`, error.message);
        }
      }
    };

    const workerCount = Math.min(this.concurrencyLimit, contractEntries.length);
    console.log(`[Listener] Starting ${workerCount} concurrent workers for ${contractEntries.length} contracts`);

    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return results;
  }

  async fetchPastEvents(fromBlock, toBlock) {
    if (this.contracts.size === 0) {
      console.warn('[Listener] No contracts configured');
      return [];
    }

    if (this.contracts.size === 1) {
      const [address, contractInfo] = this.contracts.entries().next().value;
      return await this.fetchPastEventsForContract(address, contractInfo, fromBlock, toBlock);
    }

    return await this.fetchPastEventsConcurrent(fromBlock, toBlock);
  }

  async processBlockRange(fromBlock, toBlock) {
    const range = toBlock - fromBlock + 1;
    console.log(`[Listener] Processing blocks ${fromBlock} - ${toBlock} (${range} blocks, ${this.contracts.size} contracts)`);

    const startTime = Date.now();
    const events = await this.fetchPastEvents(fromBlock, toBlock);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`[Listener] Found ${events.length} events in ${duration}s`);

    return events;
  }

  async start(onEvents) {
    this.isRunning = true;
    console.log('[Listener] Starting blockchain listener...');
    console.log(`[Listener] Concurrency limit: ${this.concurrencyLimit}, Max block range: ${config.blockchain.maxBlockRange}`);

    const poll = async () => {
      if (!this.isRunning) return;

      if (this.isProcessing) {
        console.log('[Listener] Previous poll still processing, skipping');
        setTimeout(poll, config.blockchain.pollInterval);
        return;
      }

      this.isProcessing = true;

      try {
        const currentBlock = await this.getCurrentBlock();
        const lastProcessed = await this.cache.getLastProcessedBlock();
        const safeBlock = Number(currentBlock) - config.blockchain.confirmations;

        if (safeBlock <= lastProcessed) {
          console.log(`[Listener] No new blocks. Last: ${lastProcessed}, Safe: ${safeBlock}`);
          this.isProcessing = false;
          setTimeout(poll, config.blockchain.pollInterval);
          return;
        }

        const fromBlock = lastProcessed + 1;
        const toBlock = safeBlock;

        const events = await this.processBlockRange(fromBlock, toBlock);

        if (events.length > 0 && onEvents) {
          await onEvents(events);
        }

        await this.cache.setLastProcessedBlock(safeBlock);
        console.log(`[Listener] Updated last processed block to: ${safeBlock}`);
      } catch (error) {
        console.error('[Listener] Polling error:', error);
      } finally {
        this.isProcessing = false;
        setTimeout(poll, config.blockchain.pollInterval);
      }
    };

    poll();
  }

  stop() {
    this.isRunning = false;
    console.log('[Listener] Stopping blockchain listener...');
  }
}

module.exports = BlockchainListener;
