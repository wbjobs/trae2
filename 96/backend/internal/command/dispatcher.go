package command

import (
	"container/heap"
	"log"
	"sync"
	"time"

	"icc-server/internal/driver"
	"icc-server/internal/model"
)

type PriorityQueue []*model.Command

func (pq PriorityQueue) Len() int { return len(pq) }

func (pq PriorityQueue) Less(i, j int) bool {
	return pq[i].Priority > pq[j].Priority
}

func (pq PriorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
}

func (pq *PriorityQueue) Push(x interface{}) {
	item := x.(*model.Command)
	*pq = append(*pq, item)
}

func (pq *PriorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	*pq = old[0 : n-1]
	return item
}

type Dispatcher struct {
	driverMgr        *driver.Manager
	queue            PriorityQueue
	commands         map[string]*model.Command
	scheduledCmds    map[string]*model.ScheduledCommand
	workers          int
	stopCh           chan struct{}
	mu               sync.RWMutex
	scheduleMu       sync.RWMutex
	running          bool
}

func NewDispatcher(driverMgr *driver.Manager) *Dispatcher {
	return &Dispatcher{
		driverMgr:     driverMgr,
		queue:         make(PriorityQueue, 0),
		commands:      make(map[string]*model.Command),
		scheduledCmds: make(map[string]*model.ScheduledCommand),
		workers:       4,
		stopCh:        make(chan struct{}),
	}
}

func (d *Dispatcher) Start() {
	d.mu.Lock()
	d.running = true
	d.mu.Unlock()

	heap.Init(&d.queue)

	for i := 0; i < d.workers; i++ {
		go d.worker(i)
	}

	go d.scheduleLoop()

	log.Printf("[Dispatcher] Started with %d workers", d.workers)
}

func (d *Dispatcher) Stop() {
	d.mu.Lock()
	d.running = false
	d.mu.Unlock()
	close(d.stopCh)
	log.Println("[Dispatcher] Stopped")
}

func (d *Dispatcher) Enqueue(cmd model.Command) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	cmd.Status = model.CommandStatusPending
	cmd.CreatedAt = time.Now()
	d.commands[cmd.ID] = &cmd
	heap.Push(&d.queue, &cmd)

	log.Printf("[Dispatcher] Command enqueued: %s (action=%s, device=%s, priority=%d)",
		cmd.ID, cmd.Action, cmd.DeviceID, cmd.Priority)
	return nil
}

func (d *Dispatcher) GetCommand(id string) (*model.Command, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	cmd, ok := d.commands[id]
	if !ok {
		return nil, ErrCommandNotFound
	}
	return cmd, nil
}

func (d *Dispatcher) ListCommands() []*model.Command {
	d.mu.RLock()
	defer d.mu.RUnlock()
	result := make([]*model.Command, 0, len(d.commands))
	for _, cmd := range d.commands {
		result = append(result, cmd)
	}
	return result
}

func (d *Dispatcher) worker(id int) {
	log.Printf("[Dispatcher] Worker %d started", id)
	for {
		select {
		case <-d.stopCh:
			log.Printf("[Dispatcher] Worker %d stopped", id)
			return
		default:
			cmd := d.dequeue()
			if cmd == nil {
				time.Sleep(100 * time.Millisecond)
				continue
			}
			d.execute(cmd, id)
		}
	}
}

func (d *Dispatcher) dequeue() *model.Command {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.queue.Len() == 0 {
		return nil
	}

	cmd := heap.Pop(&d.queue).(*model.Command)
	return cmd
}

func (d *Dispatcher) execute(cmd *model.Command, workerID int) {
	d.mu.Lock()
	cmd.Status = model.CommandStatusRunning
	d.mu.Unlock()

	log.Printf("[Dispatcher] Worker %d executing command %s (action=%s)", workerID, cmd.ID, cmd.Action)

	result, err := d.driverMgr.SendCommand(cmd.DeviceID, cmd.Action, cmd.Params)

	d.mu.Lock()
	now := time.Now()
	cmd.ExecutedAt = &now

	if err != nil {
		cmd.Status = model.CommandStatusFailed
		cmd.Error = err.Error()
		log.Printf("[Dispatcher] Command %s failed: %s", cmd.ID, err.Error())
	} else {
		cmd.Status = model.CommandStatusCompleted
		cmd.Result = result
		log.Printf("[Dispatcher] Command %s completed", cmd.ID)
	}
	d.mu.Unlock()
}

func (e *CommandNotFoundError) Error() string {
	return "command not found"
}

func (d *Dispatcher) scheduleLoop() {
	log.Println("[Scheduler] Scheduled command loop started")
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-d.stopCh:
			log.Println("[Scheduler] Scheduled command loop stopped")
			return
		case <-ticker.C:
			d.checkScheduledCommands()
		}
	}
}

func (d *Dispatcher) checkScheduledCommands() {
	now := time.Now()

	d.scheduleMu.RLock()
	defer d.scheduleMu.RUnlock()

	for _, sc := range d.scheduledCmds {
		if !sc.Enabled {
			continue
		}

		if now.After(sc.NextRunAt) || now.Equal(sc.NextRunAt) {
			d.triggerScheduledCommand(sc)
		}
	}
}

func (d *Dispatcher) triggerScheduledCommand(sc *model.ScheduledCommand) {
	cmd := model.Command{
		ID:       "CMD" + time.Now().Format("20060102150405"),
		DeviceID: sc.DeviceID,
		Action:   sc.Action,
		Params:   sc.Params,
		Priority: 3,
	}

	if err := d.Enqueue(cmd); err != nil {
		log.Printf("[Scheduler] Failed to enqueue scheduled command %s: %v", sc.ID, err)
		return
	}

	d.scheduleMu.Lock()
	defer d.scheduleMu.Unlock()

	now := time.Now()
	sc.LastRunAt = &now
	if sc.Interval > 0 {
		sc.NextRunAt = now.Add(sc.Interval)
	} else {
		sc.NextRunAt = now.Add(24 * time.Hour)
	}
	sc.UpdatedAt = now

	log.Printf("[Scheduler] Triggered scheduled command: %s -> %s (device=%s, action=%s)",
		sc.ID, cmd.ID, sc.DeviceID, sc.Action)
}

func (d *Dispatcher) AddScheduledCommand(sc model.ScheduledCommand) (*model.ScheduledCommand, error) {
	d.scheduleMu.Lock()
	defer d.scheduleMu.Unlock()

	sc.ID = "SCH" + time.Now().Format("20060102150405")
	sc.CreatedAt = time.Now()
	sc.UpdatedAt = time.Now()
	if sc.Interval > 0 {
		sc.NextRunAt = time.Now().Add(sc.Interval)
	} else {
		sc.NextRunAt = time.Now().Add(24 * time.Hour)
	}

	d.scheduledCmds[sc.ID] = &sc

	log.Printf("[Scheduler] Added scheduled command: %s (name=%s, interval=%v)",
		sc.ID, sc.Name, sc.Interval)
	return &sc, nil
}

func (d *Dispatcher) UpdateScheduledCommand(sc model.ScheduledCommand) error {
	d.scheduleMu.Lock()
	defer d.scheduleMu.Unlock()

	existing, ok := d.scheduledCmds[sc.ID]
	if !ok {
		return ErrScheduledCommandNotFound
	}

	existing.Name = sc.Name
	existing.DeviceID = sc.DeviceID
	existing.Action = sc.Action
	existing.Params = sc.Params
	existing.Interval = sc.Interval
	existing.Enabled = sc.Enabled
	existing.UpdatedAt = time.Now()

	log.Printf("[Scheduler] Updated scheduled command: %s (name=%s, enabled=%v)",
		sc.ID, sc.Name, sc.Enabled)
	return nil
}

func (d *Dispatcher) DeleteScheduledCommand(id string) error {
	d.scheduleMu.Lock()
	defer d.scheduleMu.Unlock()

	if _, ok := d.scheduledCmds[id]; !ok {
		return ErrScheduledCommandNotFound
	}

	delete(d.scheduledCmds, id)
	log.Printf("[Scheduler] Deleted scheduled command: %s", id)
	return nil
}

func (d *Dispatcher) ListScheduledCommands() []*model.ScheduledCommand {
	d.scheduleMu.RLock()
	defer d.scheduleMu.RUnlock()

	result := make([]*model.ScheduledCommand, 0, len(d.scheduledCmds))
	for _, sc := range d.scheduledCmds {
		result = append(result, sc)
	}
	return result
}

func (d *Dispatcher) GetScheduledCommand(id string) (*model.ScheduledCommand, error) {
	d.scheduleMu.RLock()
	defer d.scheduleMu.RUnlock()

	sc, ok := d.scheduledCmds[id]
	if !ok {
		return nil, ErrScheduledCommandNotFound
	}
	return sc, nil
}

func (d *Dispatcher) TriggerScheduledCommand(id string) error {
	d.scheduleMu.RLock()
	sc, ok := d.scheduledCmds[id]
	d.scheduleMu.RUnlock()

	if !ok {
		return ErrScheduledCommandNotFound
	}

	d.triggerScheduledCommand(sc)
	return nil
}

var ErrScheduledCommandNotFound = &ScheduledCommandNotFoundError{}

type ScheduledCommandNotFoundError struct{}

func (e *ScheduledCommandNotFoundError) Error() string {
	return "scheduled command not found"
}
