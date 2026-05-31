package cmd

import (
	"cluster-ops-tool/pkg/storage"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	recordDate     string
	recordServer   string
	recordLimit    int
	recordBatch    string
	recordDetail   bool
	recordFormat   string
	recordOutput   string
)

var recordCmd = &cobra.Command{
	Use:   "record",
	Short: "执行结果管理",
	Long:  `查询和管理命令执行结果记录`,
}

var recordListCmd = &cobra.Command{
	Use:   "list",
	Short: "列出执行记录",
	Long:  `列出命令执行历史记录`,
	Run:   runRecordList,
}

var recordBatchCmd = &cobra.Command{
	Use:   "batch",
	Short: "查询批次记录",
	Long:  `查询批次执行记录`,
	Run:   runRecordBatch,
}

var recordShowCmd = &cobra.Command{
	Use:   "show",
	Short: "查看批次详情",
	Long:  `查看指定批次的详细执行结果`,
	Args:  cobra.MinimumNArgs(1),
	Run:   runRecordShow,
}

var recordExportCmd = &cobra.Command{
	Use:   "export",
	Short: "导出执行记录",
	Long:  `导出执行记录为CSV或JSON格式`,
	Run:   runRecordExport,
}

func init() {
	rootCmd.AddCommand(recordCmd)
	recordCmd.AddCommand(recordListCmd)
	recordCmd.AddCommand(recordBatchCmd)
	recordCmd.AddCommand(recordShowCmd)
	recordCmd.AddCommand(recordExportCmd)

	recordListCmd.Flags().StringVarP(&recordDate, "date", "d", "", "指定日期 (YYYY-MM-DD)，默认今天")
	recordListCmd.Flags().StringVarP(&recordServer, "server", "s", "", "指定服务器名称")
	recordListCmd.Flags().IntVarP(&recordLimit, "limit", "n", 20, "显示记录数")
	recordListCmd.Flags().BoolVarP(&recordDetail, "detail", "v", false, "显示详细信息")

	recordBatchCmd.Flags().StringVarP(&recordDate, "date", "d", "", "指定日期")
	recordBatchCmd.Flags().IntVarP(&recordLimit, "limit", "n", 10, "显示记录数")

	recordShowCmd.Flags().BoolVarP(&recordDetail, "detail", "v", true, "显示详细输出")

	recordExportCmd.Flags().StringVarP(&recordDate, "date", "d", "", "指定日期")
	recordExportCmd.Flags().StringVarP(&recordServer, "server", "s", "", "指定服务器")
	recordExportCmd.Flags().StringVarP(&recordFormat, "format", "f", "csv", "导出格式: csv/json")
	recordExportCmd.Flags().StringVarP(&recordOutput, "output", "o", "records.csv", "输出文件")
}

func runRecordList(cmd *cobra.Command, args []string) {
	store := storage.DefaultStorage()

	records, err := store.ListRecords(recordDate, recordServer, recordLimit)
	if err != nil {
		color.Red("查询记录失败: %v\n", err)
		return
	}

	if len(records) == 0 {
		color.Yellow("未找到执行记录\n")
		return
	}

	displayDate := recordDate
	if displayDate == "" {
		displayDate = "今天"
	}

	color.Cyan("执行记录 (%s):\n\n", displayDate)

	if recordDetail {
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "时间\t服务器\t主机\t命令\t状态\t耗时\t重试")
		fmt.Fprintln(w, strings.Repeat("-", 80))

		for _, r := range records {
			status := color.GreenString("成功")
			if !r.Success {
				status = color.RedString("失败")
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%.2fs\t%d\n",
				r.Timestamp.Format("15:04:05"),
				r.ServerName,
				r.Host,
				truncateString(r.Command, 40),
				status,
				r.Duration,
				r.RetryCount)
		}
		w.Flush()
	} else {
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
		fmt.Fprintln(w, "时间\t服务器\t命令\t状态")
		fmt.Fprintln(w, strings.Repeat("-", 60))

		for _, r := range records {
			status := color.GreenString("✓")
			if !r.Success {
				status = color.RedString("✗")
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%s\n",
				r.Timestamp.Format("15:04:05"),
				r.ServerName,
				truncateString(r.Command, 50),
				status)
		}
		w.Flush()
	}

	color.Cyan("\n共 %d 条记录\n", len(records))
}

func runRecordBatch(cmd *cobra.Command, args []string) {
	store := storage.DefaultStorage()

	batches, err := store.ListBatches(recordDate, recordLimit)
	if err != nil {
		color.Red("查询批次失败: %v\n", err)
		return
	}

	if len(batches) == 0 {
		color.Yellow("未找到批次记录\n")
		return
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
	fmt.Fprintln(w, "批次ID\t时间\t命令\t服务器\t成功\t失败")
	fmt.Fprintln(w, strings.Repeat("-", 80))

	for _, b := range batches {
		successColor := color.New(color.FgGreen).SprintFunc()
		failColor := color.New(color.FgRed).SprintFunc()

		fmt.Fprintf(w, "%s\t%s\t%s\t%d\t%s\t%s\n",
			truncateString(b.BatchID, 15),
			b.Timestamp.Format("2006-01-02 15:04:05"),
			truncateString(b.Command, 30),
			b.ServerCount,
			successColor(b.Success),
			failColor(b.Failed))
	}
	w.Flush()

	color.Cyan("\n共 %d 个批次\n", len(batches))
}

func runRecordShow(cmd *cobra.Command, args []string) {
	batchID := args[0]
	store := storage.DefaultStorage()

	batch, err := store.GetBatch(batchID)
	if err != nil {
		color.Red("查询批次失败: %v\n", err)
		return
	}

	color.Cyan("批次信息:\n")
	color.Cyan("  批次ID: %s\n", batch.BatchID)
	color.Cyan("  执行时间: %s\n", batch.Timestamp.Format("2006-01-02 15:04:05"))
	color.Cyan("  命令: %s\n", batch.Command)
	if batch.Group != "" {
		color.Cyan("  分组: %s\n", batch.Group)
	}
	color.Cyan("  服务器数: %d\n", batch.ServerCount)
	color.Cyan("  成功: %d, 失败: %d\n\n", batch.Success, batch.Failed)

	if len(batch.Records) == 0 {
		color.Yellow("  无执行记录\n")
		return
	}

	color.Cyan("执行详情:\n\n")

	successCount := 0
	failCount := 0

	sort.Slice(batch.Records, func(i, j int) bool {
		return batch.Records[i].ServerName < batch.Records[j].ServerName
	})

	for i, r := range batch.Records {
		prefix := color.GreenString("[%d] ✓ ", i+1)
		if !r.Success {
			prefix = color.RedString("[%d] ✗ ")
			failCount++
		} else {
			successCount++
		}

		fmt.Printf("%s%s (%s)\n", prefix, r.ServerName, r.Host)
		fmt.Printf("    命令: %s\n", truncateString(r.Command, 60))
		fmt.Printf("    耗时: %.2fs, 重试: %d\n", r.Duration, r.RetryCount)

		if recordDetail {
			if r.Stdout != "" {
				fmt.Printf("    输出:\n")
				lines := strings.Split(strings.TrimSpace(r.Stdout), "\n")
				for _, line := range lines {
					if line != "" {
						fmt.Printf("      %s\n", line)
					}
				}
			}
			if r.Stderr != "" {
				color.Yellow("    错误:\n")
				lines := strings.Split(strings.TrimSpace(r.Stderr), "\n")
				for _, line := range lines {
					if line != "" {
						fmt.Printf("      %s\n", line)
					}
				}
			}
		}
		if r.Error != "" {
			color.Red("    错误: %s\n", r.Error)
		}
		fmt.Println()
	}

	color.Cyan("\n总计: 成功 %d, 失败 %d\n", successCount, failCount)
}

func runRecordExport(cmd *cobra.Command, args []string) {
	store := storage.DefaultStorage()

	records, err := store.ListRecords(recordDate, recordServer, 0)
	if err != nil {
		color.Red("查询记录失败: %v\n", err)
		return
	}

	if len(records) == 0 {
		color.Yellow("未找到执行记录\n")
		return
	}

	if recordFormat == "json" {
		if err := exportToJSON(records, recordOutput); err != nil {
			color.Red("导出失败: %v\n", err)
		} else {
			color.Green("已导出 %d 条记录到 %s\n", len(records), recordOutput)
		}
	} else {
		if err := exportToCSV(records, recordOutput); err != nil {
			color.Red("导出失败: %v\n", err)
		} else {
			color.Green("已导出 %d 条记录到 %s\n", len(records), recordOutput)
		}
	}
}

func exportToJSON(records []storage.ExecRecord, filename string) error {
	data, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filename, data, 0644)
}

func exportToCSV(records []storage.ExecRecord, filename string) error {
	f, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer f.Close()

	header := "时间,服务器,主机,分组,命令,状态,退出码,耗时(秒),重试次数,输出,错误\n"
	if _, err := f.WriteString(header); err != nil {
		return err
	}

	for _, r := range records {
		status := "成功"
		if !r.Success {
			status = "失败"
		}
		line := fmt.Sprintf("%s,%s,%s,%s,%q,%s,%d,%.2f,%d,%q,%q\n",
			r.Timestamp.Format(time.RFC3339),
			r.ServerName,
			r.Host,
			r.Group,
			escapeCSV(r.Command),
			status,
			r.ExitCode,
			r.Duration,
			r.RetryCount,
			escapeCSV(r.Stdout),
			escapeCSV(r.Error))
		if _, err := f.WriteString(line); err != nil {
			return err
		}
	}

	return nil
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

func escapeCSV(s string) string {
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\t", " ")
	if strings.Contains(s, ",") || strings.Contains(s, "\"") {
		s = strings.ReplaceAll(s, "\"", "\"\"")
	}
	return s
}
