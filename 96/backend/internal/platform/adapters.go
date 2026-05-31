package platform

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"syscall"
)

type WindowsAdapter struct{}

func (a *WindowsAdapter) SerialPorts() ([]string, error) {
	cmd := exec.Command("powershell", "-Command",
		"Get-WmiObject -Class Win32_SerialPort | Select-Object -ExpandProperty DeviceID")
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	ports := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			ports = append(ports, strings.TrimSpace(line))
		}
	}
	return ports, nil
}

func (a *WindowsAdapter) NetworkInterfaces() ([]string, error) {
	cmd := exec.Command("powershell", "-Command",
		"Get-NetAdapter | Select-Object -ExpandProperty Name")
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	ifaces := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			ifaces = append(ifaces, strings.TrimSpace(line))
		}
	}
	return ifaces, nil
}

func (a *WindowsAdapter) CPUUsage() (float64, error) {
	cmd := exec.Command("wmic", "cpu", "get", "LoadPercentage", "/value")
	out, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	content := string(out)
	for _, line := range strings.Split(content, "\n") {
		if strings.HasPrefix(line, "LoadPercentage=") {
			var val float64
			fmt.Sscanf(line, "LoadPercentage=%f", &val)
			return val, nil
		}
	}
	return 0, fmt.Errorf("could not parse CPU usage")
}

func (a *WindowsAdapter) MemoryUsage() (float64, error) {
	cmd := exec.Command("wmic", "OS", "get", "FreePhysicalMemory,TotalVisibleMemorySize", "/value")
	out, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	content := string(out)
	var free, total float64
	for _, line := range strings.Split(content, "\n") {
		if strings.HasPrefix(line, "FreePhysicalMemory=") {
			fmt.Sscanf(line, "FreePhysicalMemory=%f", &free)
		}
		if strings.HasPrefix(line, "TotalVisibleMemorySize=") {
			fmt.Sscanf(line, "TotalVisibleMemorySize=%f", &total)
		}
	}
	if total > 0 {
		return (1 - free/total) * 100, nil
	}
	return 0, fmt.Errorf("could not parse memory usage")
}

func (a *WindowsAdapter) IsElevated() bool {
	_, err := os.Open("\\\\.\\PHYSICALDRIVE0")
	return err == nil
}

func (a *WindowsAdapter) ExecuteCommand(cmd string) (string, error) {
	out, err := exec.Command("powershell", "-Command", cmd).CombinedOutput()
	return string(out), err
}

type LinuxAdapter struct{}

func (a *LinuxAdapter) SerialPorts() ([]string, error) {
	files, err := os.ReadDir("/dev")
	if err != nil {
		return nil, err
	}
	ports := make([]string, 0)
	for _, f := range files {
		name := f.Name()
		if strings.HasPrefix(name, "ttyS") || strings.HasPrefix(name, "ttyUSB") || strings.HasPrefix(name, "ttyACM") {
			ports = append(ports, "/dev/"+name)
		}
	}
	return ports, nil
}

func (a *LinuxAdapter) NetworkInterfaces() ([]string, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(ifaces))
	for _, iface := range ifaces {
		names = append(names, iface.Name)
	}
	return names, nil
}

func (a *LinuxAdapter) CPUUsage() (float64, error) {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0, err
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "cpu ") {
			fields := strings.Fields(line)
			var user, nice, system, idle, iowait, irq, softirq float64
			fmt.Sscanf(fields[1], "%f", &user)
			fmt.Sscanf(fields[2], "%f", &nice)
			fmt.Sscanf(fields[3], "%f", &system)
			fmt.Sscanf(fields[4], "%f", &idle)
			fmt.Sscanf(fields[5], "%f", &iowait)
			fmt.Sscanf(fields[6], "%f", &irq)
			fmt.Sscanf(fields[7], "%f", &softirq)

			total := user + nice + system + idle + iowait + irq + softirq
			used := total - idle - iowait
			return (used / total) * 100, nil
		}
	}
	return 0, fmt.Errorf("could not parse CPU usage")
}

func (a *LinuxAdapter) MemoryUsage() (float64, error) {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0, err
	}
	var total, free, buffers, cached float64
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		switch fields[0] {
		case "MemTotal:":
			fmt.Sscanf(fields[1], "%f", &total)
		case "MemFree:":
			fmt.Sscanf(fields[1], "%f", &free)
		case "Buffers:":
			fmt.Sscanf(fields[1], "%f", &buffers)
		case "Cached:":
			fmt.Sscanf(fields[1], "%f", &cached)
		}
	}
	if total > 0 {
		used := total - free - buffers - cached
		return (used / total) * 100, nil
	}
	return 0, fmt.Errorf("could not parse memory usage")
}

func (a *LinuxAdapter) IsElevated() bool {
	return os.Geteuid() == 0
}

func (a *LinuxAdapter) ExecuteCommand(cmd string) (string, error) {
	out, err := exec.Command("/bin/sh", "-c", cmd).CombinedOutput()
	return string(out), err
}

type GenericAdapter struct{}

func (a *GenericAdapter) SerialPorts() ([]string, error) {
	return []string{}, nil
}

func (a *GenericAdapter) NetworkInterfaces() ([]string, error) {
	return []string{}, nil
}

func (a *GenericAdapter) CPUUsage() (float64, error) {
	return 0, fmt.Errorf("not supported")
}

func (a *GenericAdapter) MemoryUsage() (float64, error) {
	return 0, fmt.Errorf("not supported")
}

func (a *GenericAdapter) IsElevated() bool {
	return false
}

func (a *GenericAdapter) ExecuteCommand(cmd string) (string, error) {
	return "", fmt.Errorf("not supported")
}
