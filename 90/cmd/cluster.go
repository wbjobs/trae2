package cmd

import (
	"cluster-ops-tool/pkg/config"
	"cluster-ops-tool/pkg/ssh"
	"fmt"
	"sync"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	clusterGroup string
)

var clusterCmd = &cobra.Command{
	Use:   "cluster",
	Short: "集群连接管理",
	Long:  `测试和管理集群服务器连接`,
}

var clusterTestCmd = &cobra.Command{
	Use:   "test",
	Short: "测试集群服务器连接",
	Long:  `测试配置文件中所有或指定服务器组的连接状态`,
	Run:   runClusterTest,
}

var clusterListCmd = &cobra.Command{
	Use:   "list",
	Short: "列出集群服务器列表",
	Long:  `列出配置文件中所有服务器信息`,
	Run:   runClusterList,
}

func init() {
	rootCmd.AddCommand(clusterCmd)
	clusterCmd.AddCommand(clusterTestCmd)
	clusterCmd.AddCommand(clusterListCmd)

	clusterTestCmd.Flags().StringVarP(&clusterGroup, "group", "g", "", "指定服务器组")
	clusterListCmd.Flags().StringVarP(&clusterGroup, "group", "g", "", "指定服务器组")
}

func runClusterTest(cmd *cobra.Command, args []string) {
	_, err := config.LoadConfig(configFile)
	if err != nil {
		color.Red("加载配置文件失败: %v\n", err)
		return
	}

	servers := config.GetServersByGroup(clusterGroup)
	if len(servers) == 0 {
		color.Yellow("未找到服务器\n")
		return
	}

	color.Cyan("开始测试 %d 台服务器连接...\n", len(servers))

	var wg sync.WaitGroup
	results := make(chan string, len(servers))

	for _, server := range servers {
		wg.Add(1)
		go func(s config.Server) {
			defer wg.Done()
			client, err := ssh.NewSSHClient(s)
			if err != nil {
				results <- fmt.Sprintf("%s [%s] 连接失败: %v", s.Name, s.Host, err)
				return
			}
			defer client.Close()

			result := client.Execute("uname -a")
			if result.Error != nil {
				results <- fmt.Sprintf("%s [%s] 执行命令失败: %v", s.Name, s.Host, result.Error)
				return
			}
			results <- fmt.Sprintf("%s [%s] 连接成功", s.Name, s.Host)
		}(server)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	successCount := 0
	failCount := 0

	for result := range results {
		if len(result) > 0 {
			if result[len(result)-6:] == "连接成功" {
				color.Green("✓ %s\n", result)
				successCount++
			} else {
				color.Red("✗ %s\n", result)
				failCount++
			}
		}
	}

	color.Cyan("\n连接测试完成: 成功 %d 台, 失败 %d 台\n", successCount, failCount)
}

func runClusterList(cmd *cobra.Command, args []string) {
	cfg, err := config.LoadConfig(configFile)
	if err != nil {
		color.Red("加载配置文件失败: %v\n", err)
		return
	}

	servers := config.GetServersByGroup(clusterGroup)
	if len(servers) == 0 {
		color.Yellow("未找到服务器\n")
		return
	}

	color.Cyan("%-15s %-20s %-10s %-15s %s\n", "名称", "主机", "端口", "用户", "分组")
	color.Cyan("------------------------------------------------------------------------\n")

	for _, s := range servers {
		authMethod := "密码"
		if s.KeyFile != "" {
			authMethod = "密钥"
		}
		fmt.Printf("%-15s %-20s %-10d %-15s %s\n", s.Name, s.Host, s.Port, s.User, s.Group)
	}

	color.Cyan("\n共 %d 台服务器\n", len(servers))
	_ = cfg
}
