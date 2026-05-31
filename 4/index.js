#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

const CONFIG_PATHS = [
  '.sys-tool.json',
  '.sys-toolrc',
  'sys-tool.config.json',
  path.join(process.env.HOME || process.env.USERPROFILE, '.sys-tool.json'),
  path.join(process.env.HOME || process.env.USERPROFILE, '.sys-toolrc')
];

function loadConfig() {
  const defaultConfig = {
    dependencies: [
      { name: 'Node.js', command: 'node --version', regex: 'v(\\d+\\.\\d+\\.\\d+)' },
      { name: 'npm', command: 'npm --version', regex: '(\\d+\\.\\d+\\.\\d+)' },
      { name: 'yarn', command: 'yarn --version', regex: '(\\d+\\.\\d+\\.\\d+)' },
      { name: 'Git', command: 'git --version', regex: '(\\d+\\.\\d+\\.\\d+)' },
      { name: 'Python', command: 'python --version || python3 --version', regex: '(\\d+\\.\\d+\\.\\d+)' },
      { name: 'Java', command: 'java -version', regex: 'version "(\\d+\\.\\d+\\.\\d+)' },
      { name: 'Docker', command: 'docker --version', regex: '(\\d+\\.\\d+\\.\\d+)' },
      { name: 'Go', command: 'go version', regex: 'go(\\d+\\.\\d+\\.\\d+)' },
      { name: 'PHP', command: 'php --version', regex: 'PHP (\\d+\\.\\d+\\.\\d+)' },
      { name: 'Ruby', command: 'ruby --version', regex: 'ruby (\\d+\\.\\d+\\.\\d+)' }
    ],
    ports: [
      { port: 21, name: 'FTP' },
      { port: 22, name: 'SSH' },
      { port: 23, name: 'Telnet' },
      { port: 25, name: 'SMTP' },
      { port: 53, name: 'DNS' },
      { port: 80, name: 'HTTP' },
      { port: 110, name: 'POP3' },
      { port: 135, name: 'RPC' },
      { port: 139, name: 'NetBIOS' },
      { port: 143, name: 'IMAP' },
      { port: 443, name: 'HTTPS' },
      { port: 445, name: 'SMB' },
      { port: 3306, name: 'MySQL' },
      { port: 3389, name: 'RDP' },
      { port: 5432, name: 'PostgreSQL' },
      { port: 5900, name: 'VNC' },
      { port: 6379, name: 'Redis' },
      { port: 8080, name: 'HTTP-Proxy' },
      { port: 8443, name: 'HTTPS-Alt' },
      { port: 27017, name: 'MongoDB' }
    ],
    report: {
      outputDir: '.',
      filename: 'system-report',
      formats: ['html']
    },
    scan: {
      timeout: 2000,
      batchSize: 10
    }
  };

  for (const configPath of CONFIG_PATHS) {
    try {
      if (fs.existsSync(configPath)) {
        const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return deepMerge(defaultConfig, userConfig);
      }
    } catch (e) {
    }
  }
  
  return defaultConfig;
}

function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else if (Array.isArray(source[key])) {
      result[key] = source[key];
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

const config = loadConfig();

const program = new Command();

program
  .name('sys-tool')
  .description('跨平台系统信息采集命令行工具')
  .version('1.0.0');

function loadModule(moduleName) {
  return require(`./${moduleName}`);
}

program
  .command('info')
  .description('显示系统信息')
  .action(async () => {
    const { getSystemInfo } = loadModule('system');
    const Table = require('cli-table3');
    
    console.log(chalk.blue('\n═══ 系统信息 ═══\n'));
    const info = getSystemInfo();
    
    const table = new Table({
      head: [chalk.cyan('项目'), chalk.cyan('值')],
      colWidths: [20, 60]
    });
    
    table.push(
      ['操作系统', `${info.type} ${info.release}`],
      ['平台/架构', `${info.platform} / ${info.arch}`],
      ['主机名', info.hostname],
      ['运行时间', info.uptime],
      ['CPU', info.cpu.model],
      ['CPU核心数', `${info.cpu.cores} 核`],
      ['总内存', info.memory.total],
      ['已用内存', info.memory.used],
      ['可用内存', info.memory.free],
      ['内存使用率', info.memory.usagePercent],
      ['当前用户', info.userInfo],
      ['主目录', info.homedir]
    );
    
    console.log(table.toString());
    
    console.log(chalk.blue('\n═══ 网络接口 ═══\n'));
    const netTable = new Table({
      head: [chalk.cyan('接口'), chalk.cyan('IP地址'), chalk.cyan('子网掩码'), chalk.cyan('MAC地址')]
    });
    
    info.network.forEach(net => {
      netTable.push([net.name, net.address, net.netmask, net.mac]);
    });
    
    console.log(netTable.toString());
  });

program
  .command('check')
  .description('检测系统依赖和磁盘空间')
  .option('-d, --deps', '仅检测依赖')
  .option('-s, --disk', '仅检测磁盘空间')
  .action(async (options) => {
    const { checkDependencies, checkDiskSpace } = loadModule('check');
    const Table = require('cli-table3');
    
    if (!options.disk) {
      console.log(chalk.blue('\n═══ 依赖检测 ═══\n'));
      const deps = checkDependencies(config.dependencies);
      
      const table = new Table({
        head: [chalk.cyan('依赖名称'), chalk.cyan('状态'), chalk.cyan('版本')],
        colWidths: [15, 15, 20]
      });
      
      deps.forEach(dep => {
        const status = dep.installed 
          ? chalk.green('✓ 已安装') 
          : chalk.red('✗ 未安装');
        table.push([dep.name, status, dep.version]);
      });
      
      console.log(table.toString());
    }
    
    if (!options.deps) {
      console.log(chalk.blue('\n═══ 磁盘空间 ═══\n'));
      const disks = checkDiskSpace();
      
      const table = new Table({
        head: [chalk.cyan('驱动器'), chalk.cyan('总容量'), chalk.cyan('已使用'), chalk.cyan('可用'), chalk.cyan('使用率')]
      });
      
      disks.forEach(disk => {
        table.push([disk.name, disk.total, disk.used, disk.free, disk.usagePercent]);
      });
      
      console.log(table.toString());
    }
  });

program
  .command('scan')
  .description('扫描端口占用情况')
  .option('-r, --range <range>', '端口范围，如 1-1000')
  .option('-p, --processes', '显示进程信息')
  .action(async (options) => {
    const { scanPorts, getPortProcesses, commonPorts } = loadModule('scan');
    const Table = require('cli-table3');
    
    console.log(chalk.blue('\n═══ 端口扫描 ═══\n'));
    console.log(chalk.gray('正在扫描端口...\n'));
    
    const results = await scanPorts(options.range, config);
    const openPorts = results.filter(r => r.status === 'open');
    
    const table = new Table({
      head: [chalk.cyan('端口'), chalk.cyan('服务'), chalk.cyan('状态')],
      colWidths: [15, 20, 15]
    });
    
    results.forEach(port => {
      const status = port.status === 'open'
        ? chalk.green('✓ 开放')
        : chalk.gray('✗ 关闭');
      table.push([port.port, port.name, status]);
    });
    
    console.log(table.toString());
    console.log(chalk.yellow(`\n共发现 ${openPorts.length} 个开放端口\n`));
    
    if (options.processes) {
      console.log(chalk.blue('\n═══ 端口进程信息 ═══\n'));
      const processes = getPortProcesses();
      
      const procTable = new Table({
        head: [chalk.cyan('端口'), chalk.cyan('协议'), chalk.cyan('PID'), chalk.cyan('状态')],
        colWidths: [15, 12, 12, 15]
      });
      
      processes.forEach(proc => {
        procTable.push([proc.port, proc.proto || '-', proc.pid || '-', proc.state || '-']);
      });
      
      console.log(procTable.toString());
    }
  });

program
  .command('report')
  .description('生成完整检测报告')
  .option('-f, --format <format>', '输出格式: html|text|json|all', 'html')
  .option('-o, --output <path>', '输出文件路径')
  .option('-n, --name <name>', '输出文件名')
  .action(async (options) => {
    const { getSystemInfo } = loadModule('system');
    const { checkDependencies, checkDiskSpace } = loadModule('check');
    const { scanPorts, getPortProcesses } = loadModule('scan');
    const { generateHTMLReport, generateTextReport, generateJSONReport } = loadModule('report');
    
    console.log(chalk.blue('\n═══ 生成检测报告 ═══\n'));
    console.log(chalk.gray('正在收集系统信息...\n'));
    
    const timestamp = new Date().toLocaleString('zh-CN');
    const data = {
      timestamp,
      systemInfo: getSystemInfo(),
      dependencies: checkDependencies(config.dependencies),
      diskSpace: checkDiskSpace(),
      portScan: await scanPorts(null, config),
      portProcesses: getPortProcesses(),
      config: config
    };
    
    const format = options.format.toLowerCase();
    let outputPath = options.output || config.report.outputDir;
    let fileName = options.name || config.report.filename;
    let generatedFiles = [];
    
    try {
      if (format === 'html' || format === 'all') {
        const fullPath = path.join(outputPath, `${fileName}.html`);
        const result = generateHTMLReport(data, fullPath, config);
        generatedFiles.push({ format: 'HTML', path: result });
      }
      
      if (format === 'text' || format === 'all') {
        const fullPath = path.join(outputPath, `${fileName}.txt`);
        const result = generateTextReport(data, fullPath);
        generatedFiles.push({ format: '文本', path: result });
      }
      
      if (format === 'json' || format === 'all') {
        const fullPath = path.join(outputPath, `${fileName}.json`);
        const result = generateJSONReport(data, fullPath);
        generatedFiles.push({ format: 'JSON', path: result });
      }
      
      console.log(chalk.green('✓ 报告生成成功！\n'));
      generatedFiles.forEach(file => {
        console.log(chalk.cyan(`  ${file.format}: ${file.path}`));
      });
      console.log();
    } catch (error) {
      console.error(chalk.red('✗ 生成报告失败:'), error.message);
      process.exit(1);
    }
  });

program
  .command('all')
  .description('执行所有检测并显示结果')
  .option('-r, --report', '同时生成报告')
  .action(async (options) => {
    const { getSystemInfo } = loadModule('system');
    const { checkDependencies, checkDiskSpace } = loadModule('check');
    const { scanPorts, getPortProcesses } = loadModule('scan');
    const { generateHTMLReport } = loadModule('report');
    
    console.log(chalk.blue('\n═══════════════════════════════════════════════'));
    console.log(chalk.blue('           系统全面检测'));
    console.log(chalk.blue('═══════════════════════════════════════════════\n'));
    
    const info = getSystemInfo();
    console.log(chalk.yellow('【系统信息】'));
    console.log(`  操作系统: ${info.type} ${info.release}`);
    console.log(`  CPU: ${info.cpu.model} (${info.cpu.cores} 核)`);
    console.log(`  内存: ${info.memory.used} / ${info.memory.total} (${info.memory.usagePercent})`);
    console.log(`  运行时间: ${info.uptime}\n`);
    
    const deps = checkDependencies(config.dependencies);
    console.log(chalk.yellow('【依赖检测】'));
    deps.forEach(dep => {
      const icon = dep.installed ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${icon} ${dep.name}: ${dep.version}`);
    });
    console.log();
    
    const disks = checkDiskSpace();
    console.log(chalk.yellow('【磁盘空间】'));
    disks.forEach(disk => {
      console.log(`  ${disk.name}: ${disk.used} / ${disk.total} (${disk.usagePercent})`);
    });
    console.log();
    
    console.log(chalk.yellow('【端口扫描】'));
    console.log(chalk.gray('  正在扫描...\n'));
    const ports = await scanPorts(null, config);
    const openPorts = ports.filter(p => p.status === 'open');
    console.log(`  开放端口 (${openPorts.length}):`);
    openPorts.forEach(port => {
      console.log(`    ${chalk.green('✓')} ${port.port} (${port.name})`);
    });
    console.log();
    
    if (options.report) {
      console.log(chalk.gray('  正在生成报告...\n'));
      const timestamp = new Date().toLocaleString('zh-CN');
      const data = {
        timestamp,
        systemInfo: info,
        dependencies: deps,
        diskSpace: disks,
        portScan: ports,
        portProcesses: getPortProcesses(),
        config: config
      };
      const reportPath = path.join(config.report.outputDir, `${config.report.filename}.html`);
      const pathResult = generateHTMLReport(data, reportPath, config);
      console.log(chalk.green(`✓ 报告已生成: ${pathResult}\n`));
    }
    
    console.log(chalk.blue('═══════════════════════════════════════════════\n'));
  });

program
  .command('config')
  .description('配置文件管理')
  .option('-i, --init', '生成默认配置文件')
  .option('-s, --show', '显示当前配置')
  .option('-p, --path', '显示配置文件路径')
  .action((options) => {
    if (options.init) {
      const configPath = '.sys-tool.json';
      if (fs.existsSync(configPath)) {
        console.log(chalk.yellow(`配置文件已存在: ${configPath}`));
      } else {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(chalk.green(`✓ 配置文件已生成: ${path.resolve(configPath)}`));
      }
      return;
    }
    
    if (options.path) {
      console.log(chalk.blue('\n═══ 配置文件路径 ═══\n'));
      CONFIG_PATHS.forEach((p, i) => {
        const exists = fs.existsSync(p);
        console.log(`  ${i + 1}. ${p} ${exists ? chalk.green('(存在)') : chalk.gray('(不存在)')}`);
      });
      console.log();
      return;
    }
    
    if (options.show) {
      console.log(chalk.blue('\n═══ 当前配置 ═══\n'));
      console.log(JSON.stringify(config, null, 2));
      console.log();
      return;
    }
    
    console.log(chalk.yellow('使用 --init 生成配置文件，--show 查看配置，--path 查看配置路径'));
  });

program.parse();

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
