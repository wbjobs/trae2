package database

import (
	"sync"
	"time"
)

type BatchWriter struct {
	db         *Database
	buffer     []*PacketRecord
	bufferSize int
	flushInterval time.Duration
	mu         sync.Mutex
	stopChan   chan struct{}
	wg         sync.WaitGroup
	flushChan  chan struct{}
}

func NewBatchWriter(db *Database, bufferSize int, flushInterval time.Duration) *BatchWriter {
	bw := &BatchWriter{
		db:           db,
		buffer:       make([]*PacketRecord, 0, bufferSize),
		bufferSize:   bufferSize,
		flushInterval: flushInterval,
		stopChan:     make(chan struct{}),
		flushChan:    make(chan struct{}, 1),
	}

	bw.wg.Add(1)
	go bw.run()

	return bw
}

func (bw *BatchWriter) Write(record *PacketRecord) {
	bw.mu.Lock()
	bw.buffer = append(bw.buffer, record)
	needsFlush := len(bw.buffer) >= bw.bufferSize
	bw.mu.Unlock()

	if needsFlush {
		select {
		case bw.flushChan <- struct{}{}:
		default:
		}
	}
}

func (bw *BatchWriter) Flush() {
	select {
	case bw.flushChan <- struct{}{}:
	default:
	}
}

func (bw *BatchWriter) run() {
	defer bw.wg.Done()

	ticker := time.NewTicker(bw.flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-bw.stopChan:
			bw.flushLocked()
			return
		case <-ticker.C:
			bw.flushLocked()
		case <-bw.flushChan:
			bw.flushLocked()
		}
	}
}

func (bw *BatchWriter) flushLocked() {
	bw.mu.Lock()
	if len(bw.buffer) == 0 {
		bw.mu.Unlock()
		return
	}

	records := bw.buffer
	bw.buffer = make([]*PacketRecord, 0, bw.bufferSize)
	bw.mu.Unlock()

	if err := bw.db.InsertPacketsBatch(records); err != nil {
		for _, r := range records {
			bw.db.InsertPacket(r)
		}
	}
}

func (bw *BatchWriter) Stop() {
	close(bw.stopChan)
	bw.wg.Wait()
}

func (bw *BatchWriter) QueueSize() int {
	bw.mu.Lock()
	defer bw.mu.Unlock()
	return len(bw.buffer)
}
