package cmd

import (
	"cluster-ops-tool/pkg/config"
	"fmt"
	"os"
	"path/filepath"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	cfgAddName     string
	cfgAddHost     string
	cfgAddPort     int
	cfgAddUser     string
	cfgAddPassword string
	cfgAddKeyFile  string
	cfgAddGroup    string
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "配置管理模块",
	Long:  `管理集群节点配置信息`,
}

var configShowCmd = &cobra.Command{
	Use:   "show",
	Short: "显示当前配置",
	Long:  `显示当前配置文件内容`,
	Run:   runConfigShow,
}

var configInitCmd = &cobra.Command{
	Use:   "init",
	Short: "初始化配置文件",
	Long:  `创建示例配置文件`,
	Run:   runConfigInit,
}

var configAddCmd = &cobra.Command{
	Use:   "add",
	Short: "添加服务器节点",
	Long:  `添加新的服务器节点到配置文件`,
	Run:   runConfigAdd,
}

var configRemoveCmd = &cobra.Command{
	Use:   "remove",
	Short: "删除服务器节点",
	Long:  `从配置文件中删除服务器节点`,
	Args:  cobra.MinimumNArgs(1),
	Run:   runConfigRemove,
}

func init() {
	rootCmd.AddCommand(configCmd)
	configCmd.AddCommand(configShowCmd)
	configCmd.AddCommand(configInitCmd)
	configCmd.AddCommand(configAddCmd)
	configCmd.AddCommand(configRemoveCmd)

	configAddCmd.Flags().StringVarP(&cfgAddName, "name", "n", "", "服务器名称")
	configAddCmd.Flags().StringVarP(&cfgAddHost, "host", "H", "", "服务器地址")
	configAddCmd.Flags().IntVarP(&cfgAddPort, "port", "p", 22, "SSH 端口")
	configAddCmd.Flags().StringVarP(&cfgAddUser, "user", "u", "root", "用户名")
	configAddCmd.Flags().StringVarP(&cfgAddPassword, "password", "P", "", "密码")
	configAddCmd.Flags().StringVarP(&cfgAddKeyFile, "keyfile", "k", "", "密钥文件路径")
	configAddCmd.Flags().StringVarP(&cfgAddGroup, "group", "g", "default", "分组")
}

func runConfigShow(cmd *cobra.Command, args []string) {
	cfg, err := config.LoadConfig(configFile)
	if err != nil {
		color.Red("加载配置文件失败: %v\n", err)
		return
	}

	color.Cyan("配置文件: %s\n\n", configFile)

	color.Cyan("服务器列表 (%d 台):\n", len(cfg.Servers))
	for i, s := range cfg.Servers {
		fmt.Printf("%d. [%s] %s (%s@%s:%d)\n", i+1, s.Group, s.Name, s.User, s.Host, s.Port)
	}

	color.Cyan("\n告警配置:\n")
	fmt.Printf("  CPU 阈值: %.1f%%\n", cfg.Alerts.CPUThreshold)
	fmt.Printf("  内存阈值: %.1f%%\n", cfg.Alerts.MemoryThreshold)
	fmt.Printf("  磁盘阈值: %.1f%%\n", cfg.Alerts.DiskThreshold)
	if cfg.Alerts.WebhookURL != "" {
		fmt.Printf("  Webhook: %s\n", cfg.Alerts.WebhookURL)
	}
	if cfg.Alerts.Email.SMTP != "" {
		fmt.Printf("  Email: %s:%d\n", cfg.Alerts.Email.SMTP, cfg.Alerts.Email.Port)
	}
}

func runConfigInit(cmd *cobra.Command, args []string) {
	if _, err := os.Stat(configFile); err == nil {
		color.Yellow("配置文件已存在: %s\n", configFile)
		return
	}

	exampleConfig := `servers:
  - name: web-01
    host: 192.168.1.101
    port: 22
    user: root
    password: your_password
    group: web

  - name: db-01
    host: 192.168.1.201
    port: 22
    user: root
    keyfile: ~/.ssh/id_rsa
    group: db

alerts:
  cpu_threshold: 80
  memory_threshold: 85
  disk_threshold: 90
  webhook_url: https://your-webhook.com/alert
  email:
    smtp: smtp.example.com
    port: 587
    user: alert@example.com
    password: email_password
    to:
      - admin@example.com
`

	err := os.MkdirAll(filepath.Dir(configFile), 0755)
	if err != nil {
		color.Red("创建目录失败: %v\n", err)
		return
	}

	err = os.WriteFile(configFile, []byte(exampleConfig), 0644)
	if err != nil {
		color.Red("写入配置文件失败: %v\n", err)
		return
	}

	color.Green("配置文件已创建: %s\n", configFile)
	color.Yellow("请修改配置文件中的服务器信息和密码\n")
}

func runConfigAdd(cmd *cobra.Command, args []string) {
	if cfgAddName == "" || cfgAddHost == "" {
		color.Red("必须指定服务器名称和地址\n")
		return
	}

	if cfgAddPassword == "" && cfgAddKeyFile == "" {
		color.Red("必须指定密码或密钥文件\n")
		return
	}

	cfg, _ := config.LoadConfig(configFile)
	if cfg == nil {
		cfg = &config.Config{}
	}

	for _, s := range cfg.Servers {
		if s.Name == cfgAddName {
			color.Red("服务器名称已存在: %s\n", cfgAddName)
			return
		}
	}

	newServer := config.Server{
		Name:     cfgAddName,
		Host:     cfgAddHost,
		Port:     cfgAddPort,
		User:     cfgAddUser,
		Password: cfgAddPassword,
		KeyFile:  cfgAddKeyFile,
		Group:    cfgAddGroup,
	}

	cfg.Servers = append(cfg.Servers, newServer)

	data, err := yaml.Marshal(cfg)
	if err != nil {
		color.Red("序列化配置失败: %v\n", err)
		return
	}

	err = os.WriteFile(configFile, data, 0644)
	if err != nil {
		color.Red("写入配置文件失败: %v\n", err)
		return
	}

	color.Green("服务器已添加: %s (%s)\n", cfgAddName, cfgAddHost)
}

func runConfigRemove(cmd *cobra.Command, args []string) {
	name := args[0]

	cfg, err := config.LoadConfig(configFile)
	if err != nil {
		color.Red("加载配置文件失败: %v\n", err)
		return
	}

	newServers := make([]config.Server, 0, len(cfg.Servers))
	found := false
	for _, s := range cfg.Servers {
		if s.Name != name {
			newServers = append(newServers, s)
		} else {
			found = true
		}
	}

	if !found {
		color.Yellow("未找到服务器: %s\n", name)
		return
	}

	cfg.Servers = newServers

	data, err := yaml.Marshal(cfg)
	if err != nil {
		color.Red("序列化配置失败: %v\n", err)
		return
	}

	err = os.WriteFile(configFile, data, 0644)
	if err != nil {
		color.Red("写入配置文件失败: %v\n", err)
		return
	}

	color.Green("服务器已删除: %s\n", name)
}
