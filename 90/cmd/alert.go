package cmd

import (
	"bytes"
	"cluster-ops-tool/pkg/config"
	"encoding/json"
	"fmt"
	"net/smtp"
	"net/http"
	"strings"
	"sync"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	alertGroup string
	alertMode  string
)

type AlertMessage struct {
	Title   string `json:"title"`
	Content string `json:"content"`
	Level   string `json:"level"`
}

var alertCmd = &cobra.Command{
	Use:   "alert",
	Short: "异常告警模块",
	Long:  `监控服务器资源并发送告警通知`,
}

var alertCheckCmd = &cobra.Command{
	Use:   "check",
	Short: "检查并发送告警",
	Long:  `检查服务器资源状态，超过阈值时发送告警`,
	Run:   runAlertCheck,
}

var alertTestCmd = &cobra.Command{
	Use:   "test",
	Short: "测试告警通道",
	Long:  `测试邮件和 Webhook 告警通道`,
	Run:   runAlertTest,
}

func init() {
	rootCmd.AddCommand(alertCmd)
	alertCmd.AddCommand(alertCheckCmd)
	alertCmd.AddCommand(alertTestCmd)

	alertCheckCmd.Flags().StringVarP(&alertGroup, "group", "g", "", "指定服务器组")
	alertCheckCmd.Flags().StringVarP(&alertMode, "mode", "m", "all", "告警方式: all/webhook/email")
	alertTestCmd.Flags().StringVarP(&alertMode, "mode", "m", "all", "告警方式: all/webhook/email")
}

func runAlertCheck(cmd *cobra.Command, args []string) {
	cfg, err := config.LoadConfig(configFile)
	if err != nil {
		color.Red("加载配置文件失败: %v\n", err)
		return
	}

	servers := config.GetServersByGroup(alertGroup)
	if len(servers) == 0 {
		color.Yellow("未找到服务器\n")
		return
	}

	color.Cyan("开始检查 %d 台服务器告警状态...\n", len(servers))

	var wg sync.WaitGroup
	alertMessages := make([]AlertMessage, 0)
	alertMutex := &sync.Mutex{}

	for _, server := range servers {
		wg.Add(1)
		go func(s config.Server) {
			defer wg.Done()

			status := collectServerStatus(s)
			if status.Error != nil {
				alertMutex.Lock()
				alertMessages = append(alertMessages, AlertMessage{
					Title:   "连接失败",
					Content: fmt.Sprintf("服务器 %s (%s) 连接失败: %v", s.Name, s.Host, status.Error),
					Level:   "critical",
				})
				alertMutex.Unlock()
				return
			}

			var alerts []string
			if status.CPU > cfg.Alerts.CPUThreshold {
				alerts = append(alerts, fmt.Sprintf("CPU 使用率: %.1f%% (阈值: %.1f%%)", status.CPU, cfg.Alerts.CPUThreshold))
			}
			if status.Memory > cfg.Alerts.MemoryThreshold {
				alerts = append(alerts, fmt.Sprintf("内存使用率: %.1f%% (阈值: %.1f%%)", status.Memory, cfg.Alerts.MemoryThreshold))
			}
			if status.Disk > cfg.Alerts.DiskThreshold {
				alerts = append(alerts, fmt.Sprintf("磁盘使用率: %.1f%% (阈值: %.1f%%)", status.Disk, cfg.Alerts.DiskThreshold))
			}

			if len(alerts) > 0 {
				alertMutex.Lock()
				alertMessages = append(alertMessages, AlertMessage{
					Title:   fmt.Sprintf("服务器告警: %s", s.Name),
					Content: fmt.Sprintf("主机: %s\n%s", s.Host, strings.Join(alerts, "\n")),
					Level:   "warning",
				})
				alertMutex.Unlock()

				color.Yellow("[%s] 发现告警: %d 项\n", s.Name, len(alerts))
			} else {
				color.Green("[%s] 正常\n", s.Name)
			}
		}(server)
	}

	wg.Wait()

	if len(alertMessages) == 0 {
		color.Green("\n所有服务器状态正常，无告警\n")
		return
	}

	color.Yellow("\n共发现 %d 条告警\n", len(alertMessages))

	for _, msg := range alertMessages {
		if alertMode == "all" || alertMode == "webhook" {
			sendWebhookAlert(cfg.Alerts.WebhookURL, msg)
		}
		if alertMode == "all" || alertMode == "email" {
			sendEmailAlert(&cfg.Alerts, msg)
		}
	}
}

func runAlertTest(cmd *cobra.Command, args []string) {
	cfg, err := config.LoadConfig(configFile)
	if err != nil {
		color.Red("加载配置文件失败: %v\n", err)
		return
	}

	testMsg := AlertMessage{
		Title:   "测试告警",
		Content: "这是一条测试告警消息，用于验证告警通道是否正常工作。",
		Level:   "info",
	}

	if alertMode == "all" || alertMode == "webhook" {
		if cfg.Alerts.WebhookURL != "" {
			sendWebhookAlert(cfg.Alerts.WebhookURL, testMsg)
		} else {
			color.Yellow("未配置 Webhook URL\n")
		}
	}

	if alertMode == "all" || alertMode == "email" {
		if cfg.Alerts.Email.SMTP != "" {
			sendEmailAlert(&cfg.Alerts, testMsg)
		} else {
			color.Yellow("未配置 Email 告警\n")
		}
	}
}

func sendWebhookAlert(url string, msg AlertMessage) {
	if url == "" {
		return
	}

	payload, _ := json.Marshal(msg)
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(payload))
	if err != nil {
		color.Red("Webhook 发送失败: %v\n", err)
		return
	}
	defer resp.Body.Close()

	color.Green("Webhook 告警已发送 (状态码: %d)\n", resp.StatusCode)
}

func sendEmailAlert(cfg *config.AlertConfig, msg AlertMessage) {
	if cfg.Email.SMTP == "" || len(cfg.Email.To) == 0 {
		return
	}

	auth := smtp.PlainAuth("", cfg.Email.User, cfg.Email.Password, cfg.Email.SMTP)

	subject := fmt.Sprintf("[%s] %s", strings.ToUpper(msg.Level), msg.Title)
	body := fmt.Sprintf("Subject: %s\r\n\r\n%s", subject, msg.Content)

	addr := fmt.Sprintf("%s:%d", cfg.Email.SMTP, cfg.Email.Port)
	err := smtp.SendMail(addr, auth, cfg.Email.User, cfg.Email.To, []byte(body))
	if err != nil {
		color.Red("邮件发送失败: %v\n", err)
		return
	}

	color.Green("邮件告警已发送至 %d 个收件人\n", len(cfg.Email.To))
}
