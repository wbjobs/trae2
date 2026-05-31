package pool

import (
	"sync"
	"time"
)

type Pool struct {
	work chan func()
	wg   sync.WaitGroup
}

func New(size int, queueSize int) *Pool {
	p := &Pool{
		work: make(chan func(), queueSize),
	}
	p.wg.Add(size)
	for i := 0; i < size; i++ {
		go p.worker()
	}
	return p
}

func (p *Pool) worker() {
	defer p.wg.Done()
	for job := range p.work {
		job()
	}
}

func (p *Pool) Submit(fn func()) {
	p.work <- fn
}

func (p *Pool) TrySubmit(fn func()) bool {
	select {
	case p.work <- fn:
		return true
	default:
		return false
	}
}

func (p *Pool) SubmitWithTimeout(fn func(), timeout time.Duration) bool {
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case p.work <- fn:
		return true
	case <-timer.C:
		return false
	}
}

func (p *Pool) Close() {
	close(p.work)
	p.wg.Wait()
}

func (p *Pool) QueueLength() int {
	return len(p.work)
}

type PoolWithFunc struct {
	pool *Pool
}

func NewPoolWithFunc(size int, queueSize int, f func(interface{})) *PoolWithFunc {
	p := &PoolWithFunc{
		pool: New(size, queueSize),
	}
	return p
}

func (p *PoolWithFunc) Submit(data interface{}) {
	// 这里需要闭包捕获
}

type BytesPool struct {
	pool sync.Pool
	size int
}

func NewBytesPool(size int) *BytesPool {
	return &BytesPool{
		size: size,
		pool: sync.Pool{
			New: func() interface{} {
				return make([]byte, 0, size)
			},
		},
	}
}

func (bp *BytesPool) Get() []byte {
	return bp.pool.Get().([]byte)
}

func (bp *BytesPool) Put(b []byte) {
	if cap(b) >= bp.size {
		b = b[:0]
		bp.pool.Put(b)
	}
}
