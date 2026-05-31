const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

function getCpuInfo() {
  const cpus = os.cpus();
  
  if (!cpus || cpus.length === 0) {
    return getCpuInfoFromSystem();
  }
  
  const firstCpu = cpus[0] || {};
  
  return {
    model: firstCpu.model || getCpuModelFromSystem(),
    cores: cpus.length,
    speed: firstCpu.speed ? firstCpu.speed + ' MHz' : getCpuSpeedFromSystem()
  };
}

function getCpuInfoFromSystem() {
  const platform = os.platform();
  
  if (platform === 'linux') {
    try {
      const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
      const modelMatch = cpuinfo.match(/model name\s*:\s*(.+)/i);
      const coresMatch = cpuinfo.match(/cpu cores\s*:\s*(\d+)/i);
      const speedMatch = cpuinfo.match(/cpu MHz\s*:\s*([\d.]+)/i);
      const processorCount = (cpuinfo.match(/^processor\s*:/gm) || []).length;
      
      return {
        model: modelMatch ? modelMatch[1].trim() : '未知型号',
        cores: coresMatch ? parseInt(coresMatch[1]) : processorCount || 1,
        speed: speedMatch ? parseFloat(speedMatch[1]).toFixed(0) + ' MHz' : '未知频率'
      };
    } catch (e) {
    }
  }
  
  try {
    const cores = os.availableParallelism ? os.availableParallelism() : 1;
    return {
      model: '未知型号',
      cores: cores,
      speed: '未知频率'
    };
  } catch (e) {
    return {
      model: '未知型号',
      cores: 1,
      speed: '未知频率'
    };
  }
}

function getCpuModelFromSystem() {
  const platform = os.platform();
  
  if (platform === 'linux') {
    try {
      const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
      const modelMatch = cpuinfo.match(/model name\s*:\s*(.+)/i);
      return modelMatch ? modelMatch[1].trim() : '未知型号';
    } catch (e) {
    }
  } else if (platform === 'darwin') {
    try {
      const output = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8' });
      return output.trim();
    } catch (e) {
    }
  }
  
  return '未知型号';
}

function getCpuSpeedFromSystem() {
  const platform = os.platform();
  
  if (platform === 'linux') {
    try {
      const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
      const speedMatch = cpuinfo.match(/cpu MHz\s*:\s*([\d.]+)/i);
      return speedMatch ? parseFloat(speedMatch[1]).toFixed(0) + ' MHz' : '未知频率';
    } catch (e) {
    }
  } else if (platform === 'darwin') {
    try {
      const output = execSync('sysctl -n hw.cpufrequency', { encoding: 'utf8' });
      const hz = parseInt(output.trim());
      return (hz / 1000000).toFixed(0) + ' MHz';
    } catch (e) {
    }
  }
  
  return '未知频率';
}

function getSystemInfo() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    release: os.release(),
    type: os.type(),
    uptime: formatUptime(os.uptime()),
    cpu: getCpuInfo(),
    memory: {
      total: formatBytes(totalMem),
      free: formatBytes(freeMem),
      used: formatBytes(usedMem),
      usagePercent: ((usedMem / totalMem) * 100).toFixed(2) + '%'
    },
    network: getNetworkInterfaces(),
    userInfo: os.userInfo().username,
    homedir: os.homedir(),
    tmpdir: os.tmpdir()
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${days}天 ${hours}小时 ${minutes}分钟 ${secs}秒`;
}

function getNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  const result = [];
  
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (!addr.internal && addr.family === 'IPv4') {
        result.push({
          name,
          address: addr.address,
          netmask: addr.netmask,
          mac: addr.mac
        });
      }
    }
  }
  
  return result;
}

module.exports = {
  getSystemInfo
};
