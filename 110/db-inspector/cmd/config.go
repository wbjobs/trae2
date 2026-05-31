package cmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"text/tabwriter"

	"db-inspector/pkg/config"

	"github.com/spf13/cobra"
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "管理本地配置",
	Long:  "管理数据库集群节点配置，支持初始化、添加/删除集群、添加/删除节点、查看配置等操作。",
}

var configInitCmd = &cobra.Command{
	Use:   "init",
	Short: "初始化默认配置文件",
	RunE: func(cmd *cobra.Command, args []string) error {
		if _, err := os.Stat(cfgFile); err == nil {
			return fmt.Errorf("配置文件 %s 已存在，请先删除再初始化", cfgFile)
		}
		if err := config.InitDefaultConfigFile(cfgFile); err != nil {
			return fmt.Errorf("初始化配置文件失败: %w", err)
		}
		fmt.Printf("已初始化配置文件: %s\n", cfgFile)
		return nil
	},
}

var configShowCmd = &cobra.Command{
	Use:   "show",
	Short: "查看当前配置",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			return fmt.Errorf("加载配置失败: %w", err)
		}
		data, err := json.MarshalIndent(cfg, "", "  ")
		if err != nil {
			return fmt.Errorf("序列化配置失败: %w", err)
		}
		fmt.Println(string(data))
		return nil
	},
}

var configListClustersCmd = &cobra.Command{
	Use:   "list",
	Short: "列出所有集群",
	RunE: func(cmd *cobra.Command, args []string) error {
		clusters, err := config.ListClusters(cfgFile)
		if err != nil {
			return fmt.Errorf("列出集群失败: %w", err)
		}
		if len(clusters) == 0 {
			fmt.Println("暂无集群配置")
			return nil
		}
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "集群名称\t节点数\t节点列表")
		fmt.Fprintln(w, "--------\t------\t--------")
		for _, c := range clusters {
			var nodeNames []string
			for _, n := range c.Nodes {
				nodeNames = append(nodeNames, fmt.Sprintf("%s(%s)", n.Name, n.Type))
			}
			fmt.Fprintf(w, "%s\t%d\t%s\n", c.Name, len(c.Nodes), fmt.Sprintf("%v", nodeNames))
		}
		w.Flush()
		return nil
	},
}

var configListGroupsCmd = &cobra.Command{
	Use:   "list-groups",
	Short: "列出所有巡检分组",
	RunE: func(cmd *cobra.Command, args []string) error {
		groups, err := config.ListGroups(cfgFile)
		if err != nil {
			return fmt.Errorf("列出分组失败: %w", err)
		}
		if len(groups) == 0 {
			fmt.Println("暂无分组配置")
			return nil
		}
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "分组名称\t描述\t集群列表")
		fmt.Fprintln(w, "--------\t----\t--------")
		for _, g := range groups {
			fmt.Fprintf(w, "%s\t%s\t%s\n", g.Name, g.Description, fmt.Sprintf("%v", g.Clusters))
		}
		w.Flush()
		return nil
	},
}

var (
	addGroupName        string
	addGroupDesc        string
	addGroupClusters  []string
)

var configAddGroupCmd = &cobra.Command{
	Use:   "add-group",
	Short: "添加巡检分组",
	RunE: func(cmd *cobra.Command, args []string) error {
		if addGroupName == "" || len(addGroupClusters) == 0 {
			return fmt.Errorf("请指定分组名称 (--name) 和集群列表 (--clusters)")
		}
		group := config.InspectionGroup{
			Name:        addGroupName,
			Description: addGroupDesc,
			Clusters:    addGroupClusters,
		}
		if err := config.AddGroup(cfgFile, group); err != nil {
			return fmt.Errorf("添加分组失败: %w", err)
		}
		fmt.Printf("已添加分组: %s (包含 %d 个集群)\n", addGroupName, len(addGroupClusters))
		return nil
	},
}

var removeGroupName string

var configRemoveGroupCmd = &cobra.Command{
	Use:   "remove-group",
	Short: "删除巡检分组",
	RunE: func(cmd *cobra.Command, args []string) error {
		if removeGroupName == "" {
			return fmt.Errorf("请指定分组名称 (--name)")
		}
		if err := config.RemoveGroup(cfgFile, removeGroupName); err != nil {
			return fmt.Errorf("删除分组失败: %w", err)
		}
		fmt.Printf("已删除分组: %s\n", removeGroupName)
		return nil
	},
}

var (
	addClusterName string
)

var configAddClusterCmd = &cobra.Command{
	Use:   "add-cluster",
	Short: "添加集群",
	RunE: func(cmd *cobra.Command, args []string) error {
		if addClusterName == "" {
			return fmt.Errorf("请指定集群名称 (--name)")
		}
		cluster := config.Cluster{Name: addClusterName}
		if err := config.AddCluster(cfgFile, cluster); err != nil {
			return fmt.Errorf("添加集群失败: %w", err)
		}
		fmt.Printf("已添加集群: %s\n", addClusterName)
		return nil
	},
}

var (
	removeClusterName string
)

var configRemoveClusterCmd = &cobra.Command{
	Use:   "remove-cluster",
	Short: "删除集群",
	RunE: func(cmd *cobra.Command, args []string) error {
		if removeClusterName == "" {
			return fmt.Errorf("请指定集群名称 (--name)")
		}
		if err := config.RemoveCluster(cfgFile, removeClusterName); err != nil {
			return fmt.Errorf("删除集群失败: %w", err)
		}
		fmt.Printf("已删除集群: %s\n", removeClusterName)
		return nil
	},
}

var (
	addNodeCluster   string
	addNodeName      string
	addNodeType      string
	addNodeHost      string
	addNodePort      int
	addNodeUser      string
	addNodePassword  string
	addNodeDatabase  string
	addNodePath      string
	addNodeSSLMode   string
)

var configAddNodeCmd = &cobra.Command{
	Use:   "add-node",
	Short: "添加数据库节点",
	Long:  "向指定集群添加数据库节点，支持 mysql/postgres/sqlite 类型。",
	RunE: func(cmd *cobra.Command, args []string) error {
		if addNodeCluster == "" || addNodeName == "" || addNodeType == "" {
			return fmt.Errorf("请指定 --cluster, --name, --type")
		}
		dbType := config.DBType(addNodeType)
		if dbType != config.MySQL && dbType != config.Postgres && dbType != config.SQLite {
			return fmt.Errorf("不支持的数据库类型: %s (支持: mysql, postgres, sqlite)", addNodeType)
		}
		node := config.DBNode{
			Name:     addNodeName,
			Type:     dbType,
			Host:     addNodeHost,
			Port:     addNodePort,
			User:     addNodeUser,
			Password: addNodePassword,
			Database: addNodeDatabase,
			Path:     addNodePath,
			SSLMode:  addNodeSSLMode,
		}
		if dbType == config.MySQL && node.Port == 0 {
			node.Port = 3306
		}
		if dbType == config.Postgres && node.Port == 0 {
			node.Port = 5432
		}
		if err := config.AddNode(cfgFile, addNodeCluster, node); err != nil {
			return fmt.Errorf("添加节点失败: %w", err)
		}
		fmt.Printf("已添加节点 %s 到集群 %s\n", addNodeName, addNodeCluster)
		return nil
	},
}

var (
	removeNodeCluster string
	removeNodeName    string
)

var configRemoveNodeCmd = &cobra.Command{
	Use:   "remove-node",
	Short: "删除数据库节点",
	RunE: func(cmd *cobra.Command, args []string) error {
		if removeNodeCluster == "" || removeNodeName == "" {
			return fmt.Errorf("请指定 --cluster 和 --name")
		}
		if err := config.RemoveNode(cfgFile, removeNodeCluster, removeNodeName); err != nil {
			return fmt.Errorf("删除节点失败: %w", err)
		}
		fmt.Printf("已从集群 %s 删除节点 %s\n", removeNodeCluster, removeNodeName)
		return nil
	},
}

var (
	setThreshold   int64
	setTopN        int
	setTimeout     int
	setParallel    int
	setOutputDir   string
	setReadTimeout int
	setRetryCount  int
	setRetryDelay  int
	setMaxSQLLen   int
	setLogWindow   int
)

var configSetCmd = &cobra.Command{
	Use:   "set",
	Short: "修改全局配置项",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				cfg = config.DefaultConfig()
			} else {
				return fmt.Errorf("加载配置失败: %w", err)
			}
		}
		changed := false
		if cmd.Flags().Changed("threshold") {
			cfg.SlowQuery.ThresholdMs = setThreshold
			changed = true
		}
		if cmd.Flags().Changed("top-n") {
			cfg.SlowQuery.TopN = setTopN
			changed = true
		}
		if cmd.Flags().Changed("timeout") {
			cfg.ConnectTimeout = setTimeout
			changed = true
		}
		if cmd.Flags().Changed("parallel") {
			cfg.ParallelConns = setParallel
			changed = true
		}
		if cmd.Flags().Changed("output-dir") {
			cfg.OutputDir = setOutputDir
			changed = true
		}
		if cmd.Flags().Changed("read-timeout") {
			cfg.ReadTimeout = setReadTimeout
			changed = true
		}
		if cmd.Flags().Changed("retry-count") {
			cfg.RetryCount = setRetryCount
			changed = true
		}
		if cmd.Flags().Changed("retry-delay") {
			cfg.RetryDelayMs = setRetryDelay
			changed = true
		}
		if cmd.Flags().Changed("max-sql-len") {
			cfg.MaxSQLTextLen = setMaxSQLLen
			changed = true
		}
		if cmd.Flags().Changed("log-window") {
			cfg.SlowLogWindow = setLogWindow
			changed = true
		}
		if !changed {
			fmt.Println("未指定任何修改项")
			return nil
		}
		if err := config.SaveConfig(cfgFile, cfg); err != nil {
			return fmt.Errorf("保存配置失败: %w", err)
		}
		fmt.Println("配置已更新")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(configCmd)
	configCmd.AddCommand(configInitCmd)
	configCmd.AddCommand(configShowCmd)
	configCmd.AddCommand(configListClustersCmd)
	configCmd.AddCommand(configListGroupsCmd)
	configCmd.AddCommand(configAddClusterCmd)
	configCmd.AddCommand(configRemoveClusterCmd)
	configCmd.AddCommand(configAddGroupCmd)
	configCmd.AddCommand(configRemoveGroupCmd)
	configCmd.AddCommand(configAddNodeCmd)
	configCmd.AddCommand(configRemoveNodeCmd)
	configCmd.AddCommand(configSetCmd)

	configAddClusterCmd.Flags().StringVar(&addClusterName, "name", "", "集群名称")
	configRemoveClusterCmd.Flags().StringVar(&removeClusterName, "name", "", "集群名称")

	configAddGroupCmd.Flags().StringVar(&addGroupName, "name", "", "分组名称")
	configAddGroupCmd.Flags().StringVar(&addGroupDesc, "desc", "", "分组描述")
	configAddGroupCmd.Flags().StringSliceVar(&addGroupClusters, "clusters", nil, "集群列表(逗号分隔)")
	configRemoveGroupCmd.Flags().StringVar(&removeGroupName, "name", "", "分组名称")

	configAddNodeCmd.Flags().StringVar(&addNodeCluster, "cluster", "", "所属集群名称")
	configAddNodeCmd.Flags().StringVar(&addNodeName, "name", "", "节点名称")
	configAddNodeCmd.Flags().StringVar(&addNodeType, "type", "", "数据库类型 (mysql/postgres/sqlite)")
	configAddNodeCmd.Flags().StringVar(&addNodeHost, "host", "", "主机地址")
	configAddNodeCmd.Flags().IntVar(&addNodePort, "port", 0, "端口号")
	configAddNodeCmd.Flags().StringVar(&addNodeUser, "user", "", "用户名")
	configAddNodeCmd.Flags().StringVar(&addNodePassword, "password", "", "密码")
	configAddNodeCmd.Flags().StringVar(&addNodeDatabase, "database", "", "数据库名")
	configAddNodeCmd.Flags().StringVar(&addNodePath, "path", "", "SQLite 文件路径")
	configAddNodeCmd.Flags().StringVar(&addNodeSSLMode, "ssl-mode", "", "SSL 模式 (PostgreSQL)")

	configRemoveNodeCmd.Flags().StringVar(&removeNodeCluster, "cluster", "", "所属集群名称")
	configRemoveNodeCmd.Flags().StringVar(&removeNodeName, "name", "", "节点名称")

	configSetCmd.Flags().Int64Var(&setThreshold, "threshold", 0, "慢查询阈值(ms)")
	configSetCmd.Flags().IntVar(&setTopN, "top-n", 0, "Top N 慢查询数")
	configSetCmd.Flags().IntVar(&setTimeout, "timeout", 0, "连接超时(秒)")
	configSetCmd.Flags().IntVar(&setParallel, "parallel", 0, "并行连接数")
	configSetCmd.Flags().StringVar(&setOutputDir, "output-dir", "", "输出目录")
	configSetCmd.Flags().IntVar(&setReadTimeout, "read-timeout", 0, "读超时(秒)")
	configSetCmd.Flags().IntVar(&setRetryCount, "retry-count", 0, "连接重试次数")
	configSetCmd.Flags().IntVar(&setRetryDelay, "retry-delay", 0, "重试间隔(ms)")
	configSetCmd.Flags().IntVar(&setMaxSQLLen, "max-sql-len", 0, "SQL文本最大长度")
	configSetCmd.Flags().IntVar(&setLogWindow, "log-window", 0, "慢日志时间窗口(小时)")
}

func atoiDefault(s string, def int) int {
	v, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return v
}
