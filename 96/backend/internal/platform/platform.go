package platform

import (
	"bytes"
	"io"
	"log"
	"os"
	"runtime"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

type OS string

const (
	OSWindows   OS = "windows"
	OSLinux     OS = "linux"
	OSKylin     OS = "kylin"
	OSUOS       OS = "uos"
	OSNeoKylin  OS = "neokylin"
	OSDeepin    OS = "deepin"
	OSUnknown   OS = "unknown"
)

type Arch string

const (
	ArchAMD64   Arch = "amd64"
	ArchARM64   Arch = "arm64"
	ArchARM     Arch = "arm"
	Arch386     Arch = "386"
	ArchMIPS64  Arch = "mips64"
	ArchUnknown Arch = "unknown"
)

type Info struct {
	OS       OS     `json:"os"`
	Arch     Arch   `json:"arch"`
	Name     string `json:"name"`
	Version  string `json:"version"`
	Kernel   string `json:"kernel"`
	IsDomestic bool `json:"is_domestic"`
}

type Adapter interface {
	SerialPorts() ([]string, error)
	NetworkInterfaces() ([]string, error)
	CPUUsage() (float64, error)
	MemoryUsage() (float64, error)
	IsElevated() bool
	ExecuteCommand(cmd string) (string, error)
}

var domesticOSList = []OS{OSKylin, OSUOS, OSNeoKylin, OSDeepin}

func Detect() Info {
	info := Info{
		OS:      detectOS(),
		Arch:    detectArch(),
		Kernel:  runtime.Version(),
		Version: detectVersion(),
	}

	info.Name = getOSName(info.OS)
	info.IsDomestic = isDomestic(info.OS)

	return info
}

func detectOS() OS {
	goos := runtime.GOOS

	switch goos {
	case "windows":
		return OSWindows
	case "linux":
		return detectLinuxDistro()
	default:
		return OSUnknown
	}
}

func detectLinuxDistro() OS {
	candidates := []string{
		"/etc/os-release",
		"/etc/lsb-release",
		"/etc/issue",
		"/etc/.kyinfo",
		"/etc/kylin-release",
		"/etc/uos-release",
		"/etc/neokylin-release",
		"/etc/deepin-release",
	}

	var contentStr string
	for _, path := range candidates {
		if data, err := readFileAutoDecode(path); err == nil && len(data) > 0 {
			contentStr += string(data) + "\n"
		}
	}

	if contentStr == "" {
		return OSLinux
	}

	if containsAny(contentStr, "NeoKylin", "neokylin", "中标麒麟") {
		return OSNeoKylin
	}
	if containsAny(contentStr, "Kylin", "kylin", "银河麒麟") {
		return OSKylin
	}
	if containsAny(contentStr, "uos", "UnionTech", "统信") {
		return OSUOS
	}
	if containsAny(contentStr, "Deepin", "deepin", "深度") {
		return OSDeepin
	}

	return OSLinux
}

func readFileAutoDecode(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	if utf8.Valid(data) {
		return data, nil
	}

	reader := transform.NewReader(bytes.NewReader(data), simplifiedchinese.GBK.NewDecoder())
	decoded, err := io.ReadAll(reader)
	if err != nil {
		return data, nil
	}
	return decoded, nil
}

func containsAny(s string, keywords ...string) bool {
	for _, kw := range keywords {
		if strings.Contains(s, kw) {
			return true
		}
	}
	return false
}

func detectArch() Arch {
	goarch := runtime.GOARCH
	switch goarch {
	case "amd64":
		return ArchAMD64
	case "arm64":
		return ArchARM64
	case "arm":
		return ArchARM
	case "386":
		return Arch386
	case "mips64", "mips64le":
		return ArchMIPS64
	default:
		return ArchUnknown
	}
}

func detectVersion() string {
	if content, err := os.ReadFile("/proc/version"); err == nil {
		parts := strings.Fields(string(content))
		if len(parts) >= 3 {
			return parts[2]
		}
	}
	return runtime.Version()
}

func getOSName(os OS) string {
	switch os {
	case OSWindows:
		return "Microsoft Windows"
	case OSLinux:
		return "Linux"
	case OSKylin:
		return "银河麒麟 (Kylin)"
	case OSUOS:
		return "统信UOS"
	case OSNeoKylin:
		return "中标麒麟 (NeoKylin)"
	case OSDeepin:
		return "深度 (Deepin)"
	default:
		return "Unknown"
	}
}

func isDomestic(os OS) bool {
	for _, domestic := range domesticOSList {
		if os == domestic {
			return true
		}
	}
	return false
}

func NewAdapter(info Info) Adapter {
	switch info.OS {
	case OSWindows:
		return &WindowsAdapter{}
	case OSLinux, OSKylin, OSUOS, OSNeoKylin, OSDeepin:
		return &LinuxAdapter{}
	default:
		log.Printf("[Platform] Warning: using generic adapter for unknown OS: %s", info.OS)
		return &GenericAdapter{}
	}
}
