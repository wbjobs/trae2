package cmd

import (
	"cluster-ops-tool/pkg/config"
	"cluster-ops-tool/pkg/ssh"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	statusGroup string
)

type ServerStatus struct {
	Name      string
	Host      string
	CPU       float64
	CPUUser   float64
	CPUSystem float64
	Memory    float64
	MemUsed   uint64
	MemTotal  uint64
	MemFree   uint64
	MemCached uint64
	MemBuffer uint64
	Disk      float64
	DiskUsed  uint64
	DiskTotal uint64
	DiskRate  string
	SwapUsed  uint64
	SwapTotal uint64
	LoadAvg   string
	Load1     float64
	Load5     float64
	Load15    float64
	Uptime    string
	Processes int
	Error     error
}

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "资源状态采集",
	Long:  `采集服务器 CPU、内存、磁盘等资源状态`,
}

var statusCheckCmd = &cobra.Command{
	Use:   "check",
	Short: "检查服务器资源状态",
	Long:  `采集并显示所有或指定服务器的资源使用状态`,
	Run:   runStatusCheck,
}

func init() {
	rootCmd.AddCommand(statusCmd)
	statusCmd.AddCommand(statusCheckCmd)

	statusCheckCmd.Flags().StringVarP(&statusGroup, "group", "g", "", "指定服务器组")
}

func runStatusCheck(cmd *cobra.Command, args []string) {
	_, err := config.LoadConfig(configFile)
	if err != nil {
		color.Red("加载配置文件失败: %v\n", err)
		return
	}

	servers := config.GetServersByGroup(statusGroup)
	if len(servers) == 0 {
		color.Yellow("未找到服务器\n")
		return
	}

	color.Cyan("开始采集 %d 台服务器资源状态...\n\n", len(servers))

	var wg sync.WaitGroup
	results := make(chan *ServerStatus, len(servers))

	for _, server := range servers {
		wg.Add(1)
		go func(s config.Server) {
			defer wg.Done()
			results <- collectServerStatus(s)
		}(server)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	color.Cyan("%-12s %-18s %-7s %-7s %-10s %-7s %-10s %s\n",
		"名称", "主机", "CPU%", "内存%", "磁盘%", "负载1", "进程数", "运行时间")
	color.Cyan(strings.Repeat("-", 85))

	for status := range results {
		printServerStatus(status)
	}

	ssh.CloseAllClients()
}

func collectServerStatus(server config.Server) *ServerStatus {
	status := &ServerStatus{
		Name: server.Name,
		Host: server.Host,
	}

	client, err := ssh.GetOrCreateClient(server)
	if err != nil {
		status.Error = err
		return status
	}

	opts := ssh.ExecOptions{
		Timeout:    30 * time.Second,
		MaxRetries: 1,
		RetryDelay: 1 * time.Second,
	}

	cmd1 := `
		cat /proc/stat | grep '^cpu ';
		echo "---MEM---";
		cat /proc/meminfo;
		echo "---LOAD---";
		cat /proc/loadavg;
		echo "---UPTIME---";
		cat /proc/uptime;
		echo "---PROCS---";
		ps aux | wc -l;
	`

	result1 := client.ExecuteWithOptions(cmd1, opts)
	if result1.Error != nil {
		status.Error = result1.Error
		return status
	}

	time.Sleep(500 * time.Millisecond)

	cmd2 := `
		cat /proc/stat | grep '^cpu ';
		echo "---DISK---";
		df -P -B 1K / 2>/dev/null || df -k /;
	`

	result2 := client.ExecuteWithOptions(cmd2, opts)
	if result2.Error != nil {
		status.Error = result2.Error
		return status
	}

	parseStatusData(status, result1.Stdout, result2.Stdout)

	return status
}

func parseStatusData(status *ServerStatus, data1, data2 string) {
	parts1 := strings.Split(data1, "---MEM---")
	if len(parts1) < 2 {
		return
	}
	cpu1Line := strings.TrimSpace(parts1[0])

	parts2 := strings.Split(parts1[1], "---LOAD---")
	if len(parts2) < 2 {
		return
	}
	memData := strings.TrimSpace(parts2[0])

	parts3 := strings.Split(parts2[1], "---UPTIME---")
	if len(parts3) < 2 {
		return
	}
	loadData := strings.TrimSpace(parts3[0])

	parts4 := strings.Split(parts3[1], "---PROCS---")
	if len(parts4) < 2 {
		return
	}
	uptimeData := strings.TrimSpace(parts4[0])
	procsData := strings.TrimSpace(parts4[1])

	parts5 := strings.Split(data2, "---DISK---")
	if len(parts5) < 2 {
		return
	}
	cpu2Line := strings.TrimSpace(parts5[0])
	diskData := strings.TrimSpace(parts5[1])

	parseCPU(status, cpu1Line, cpu2Line)
	parseMemory(status, memData)
	parseLoad(status, loadData)
	parseUptime(status, uptimeData)
	parseProcesses(status, procsData)
	parseDisk(status, diskData)
}

func parseCPU(status *ServerStatus, cpu1Line, cpu2Line string) {
	fields1 := strings.Fields(cpu1Line)
	fields2 := strings.Fields(cpu2Line)

	if len(fields1) < 8 || len(fields2) < 8 {
		return
	}

	user1, _ := strconv.ParseUint(fields1[1], 10, 64)
	nice1, _ := strconv.ParseUint(fields1[2], 10, 64)
	system1, _ := strconv.ParseUint(fields1[3], 10, 64)
	idle1, _ := strconv.ParseUint(fields1[4], 10, 64)
	iowait1, _ := strconv.ParseUint(fields1[5], 10, 64)
	irq1, _ := strconv.ParseUint(fields1[6], 10, 64)
	softirq1, _ := strconv.ParseUint(fields1[7], 10, 64)

	user2, _ := strconv.ParseUint(fields2[1], 10, 64)
	nice2, _ := strconv.ParseUint(fields2[2], 10, 64)
	system2, _ := strconv.ParseUint(fields2[3], 10, 64)
	idle2, _ := strconv.ParseUint(fields2[4], 10, 64)
	iowait2, _ := strconv.ParseUint(fields2[5], 10, 64)
	irq2, _ := strconv.ParseUint(fields2[6], 10, 64)
	softirq2, _ := strconv.ParseUint(fields2[7], 10, 64)

	total1 := user1 + nice1 + system1 + idle1 + iowait1 + irq1 + softirq1
	total2 := user2 + nice2 + system2 + idle2 + iowait2 + irq2 + softirq2

	totalDiff := total2 - total1
	if totalDiff == 0 {
		return
	}

	idleDiff := idle2 - idle1
	userDiff := user2 - user1
	systemDiff := system2 - system1

	status.CPU = float64(totalDiff - idleDiff) / float64(totalDiff) * 100
	status.CPUUser = float64(userDiff) / float64(totalDiff) * 100
	status.CPUSystem = float64(systemDiff) / float64(totalDiff) * 100
}

func parseMemory(status *ServerStatus, memData string) {
	lines := strings.Split(memData, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "MemTotal:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				status.MemTotal, _ = strconv.ParseUint(fields[1], 10, 64)
			}
		} else if strings.HasPrefix(line, "MemFree:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				status.MemFree, _ = strconv.ParseUint(fields[1], 10, 64)
			}
		} else if strings.HasPrefix(line, "Cached:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				status.MemCached, _ = strconv.ParseUint(fields[1], 10, 64)
			}
		} else if strings.HasPrefix(line, "Buffers:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				status.MemBuffer, _ = strconv.ParseUint(fields[1], 10, 64)
			}
		} else if strings.HasPrefix(line, "SwapTotal:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				status.SwapTotal, _ = strconv.ParseUint(fields[1], 10, 64)
			}
		} else if strings.HasPrefix(line, "SwapFree:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				swapFree, _ := strconv.ParseUint(fields[1], 10, 64)
				status.SwapUsed = status.SwapTotal - swapFree
			}
		}
	}

	if status.MemTotal > 0 {
		status.MemUsed = status.MemTotal - status.MemFree - status.MemCached - status.MemBuffer
		status.Memory = float64(status.MemUsed) / float64(status.MemTotal) * 100
	}
}

func parseLoad(status *ServerStatus, loadData string) {
	fields := strings.Fields(loadData)
	if len(fields) >= 3 {
		status.Load1, _ = strconv.ParseFloat(fields[0], 64)
		status.Load5, _ = strconv.ParseFloat(fields[1], 64)
		status.Load15, _ = strconv.ParseFloat(fields[2], 64)
		status.LoadAvg = fmt.Sprintf("%.2f %.2f %.2f", status.Load1, status.Load5, status.Load15)
	}
}

func parseUptime(status *ServerStatus, uptimeData string) {
	fields := strings.Fields(uptimeData)
	if len(fields) >= 1 {
		uptimeSeconds, _ := strconv.ParseFloat(fields[0], 64)
		days := int(uptimeSeconds) / 86400
		hours := (int(uptimeSeconds) % 86400) / 3600
		minutes := (int(uptimeSeconds) % 3600) / 60
		if days > 0 {
			status.Uptime = fmt.Sprintf("%dd %dh %dm", days, hours, minutes)
		} else {
			status.Uptime = fmt.Sprintf("%dh %dm", hours, minutes)
		}
	}
}

func parseProcesses(status *ServerStatus, procsData string) {
	count, _ := strconv.Atoi(strings.TrimSpace(procsData))
	status.Processes = count
}

func parseDisk(status *ServerStatus, diskData string) {
	lines := strings.Split(diskData, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "/dev/") || strings.Contains(line, "/") {
			fields := strings.Fields(line)
			if len(fields) >= 5 {
				total, _ := strconv.ParseUint(fields[1], 10, 64)
				used, _ := strconv.ParseUint(fields[2], 10, 64)
				if total > 0 {
					status.DiskTotal = total
					status.DiskUsed = used
					status.Disk = float64(used) / float64(total) * 100
					status.DiskRate = fmt.Sprintf("%.1f%%", status.Disk)
				}
				break
			}
		}
	}
}

func printServerStatus(s *ServerStatus) {
	if s.Error != nil {
		color.Red("%-12s %-18s %s\n", s.Name, s.Host, s.Error.Error())
		return
	}

	cpuColor := color.New(color.FgGreen)
	if s.CPU > 70 {
		cpuColor = color.New(color.FgYellow)
	}
	if s.CPU > 90 {
		cpuColor = color.New(color.FgRed)
	}

	memColor := color.New(color.FgGreen)
	if s.Memory > 70 {
		memColor = color.New(color.FgYellow)
	}
	if s.Memory > 90 {
		memColor = color.New(color.FgRed)
	}

	diskColor := color.New(color.FgGreen)
	if s.Disk > 70 {
		diskColor = color.New(color.FgYellow)
	}
	if s.Disk > 90 {
		diskColor = color.New(color.FgRed)
	}

	fmt.Printf("%-12s %-18s ", s.Name, s.Host)
	cpuColor.Printf("%-6.1f ", s.CPU)
	memColor.Printf("%-6.1f ", s.Memory)
	diskColor.Printf("%-9.1f%% ", s.Disk)
	fmt.Printf("%-8.2f %-8d %s\n", s.Load1, s.Processes, s.Uptime)
}
