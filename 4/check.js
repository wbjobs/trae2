const { execSync } = require('child_process');
const os = require('os');

function checkDependencies(customDeps = null) {
  const dependencies = customDeps || [
    { name: 'Node.js', command: 'node --version', regex: /v(\d+\.\d+\.\d+)/ },
    { name: 'npm', command: 'npm --version', regex: /(\d+\.\d+\.\d+)/ },
    { name: 'yarn', command: 'yarn --version', regex: /(\d+\.\d+\.\d+)/ },
    { name: 'Git', command: 'git --version', regex: /(\d+\.\d+\.\d+)/ },
    { name: 'Python', command: 'python --version || python3 --version', regex: /(\d+\.\d+\.\d+)/ },
    { name: 'Java', command: 'java -version', regex: /version "(\d+\.\d+\.\d+)/ },
    { name: 'Docker', command: 'docker --version', regex: /(\d+\.\d+\.\d+)/ },
    { name: 'Go', command: 'go version', regex: /go(\d+\.\d+\.\d+)/ },
    { name: 'PHP', command: 'php --version', regex: /PHP (\d+\.\d+\.\d+)/ },
    { name: 'Ruby', command: 'ruby --version', regex: /ruby (\d+\.\d+\.\d+)/ }
  ];
  
  const results = [];
  
  for (const dep of dependencies) {
    try {
      let output;
      try {
        output = execSync(dep.command, { 
          encoding: 'utf8', 
          stdio: ['pipe', 'pipe', 'pipe'] 
        });
      } catch (e) {
        output = e.stderr || e.stdout || '';
      }
      
      const regex = typeof dep.regex === 'string' ? new RegExp(dep.regex) : dep.regex;
      const match = output.match(regex);
      const version = match ? match[1] : '未知版本';
      
      results.push({
        name: dep.name,
        installed: true,
        version
      });
    } catch (e) {
      results.push({
        name: dep.name,
        installed: false,
        version: '未安装'
      });
    }
  }
  
  return results;
}

function checkDiskSpace() {
  const drives = [];
  
  if (os.platform() === 'win32') {
    try {
      let output = '';
      let success = false;
      
      try {
        output = execSync('powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free | ConvertTo-Csv -NoTypeInformation"', { 
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        });
        const lines = output.trim().split('\n').slice(1);
        
        for (const line of lines) {
          const parts = line.trim().split(',').map(p => p.replace(/"/g, ''));
          if (parts.length >= 3) {
            const name = parts[0] + ':';
            const used = parseFloat(parts[1]);
            const free = parseFloat(parts[2]);
            
            if (!isNaN(used) && !isNaN(free)) {
              const total = used + free;
              if (total > 0) {
                drives.push({
                  name,
                  total: formatBytes(total),
                  free: formatBytes(free),
                  used: formatBytes(used),
                  usagePercent: ((used / total) * 100).toFixed(2) + '%'
                });
              }
            }
          }
        }
        success = drives.length > 0;
      } catch (e) {}
      
      if (!success) {
        try {
          output = execSync('wmic logicaldisk where drivetype=3 get name,size,freespace', { encoding: 'utf8' });
          const lines = output.trim().split('\n').slice(1);
          
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
              const name = parts[0];
              const freeSpace = parts.length > 1 ? parseInt(parts[1]) : NaN;
              const totalSize = parts.length > 2 ? parseInt(parts[parts.length - 1]) : NaN;
              
              if (!isNaN(freeSpace) && !isNaN(totalSize) && totalSize > 0) {
                drives.push({
                  name,
                  total: formatBytes(totalSize),
                  free: formatBytes(freeSpace),
                  used: formatBytes(totalSize - freeSpace),
                  usagePercent: (((totalSize - freeSpace) / totalSize) * 100).toFixed(2) + '%'
                });
              }
            }
          }
        } catch (e) {}
      }
    } catch (e) {
      drives.push({ error: '无法获取磁盘信息' });
    }
  } else {
    try {
      const output = execSync('df -h', { encoding: 'utf8' });
      const lines = output.trim().split('\n').slice(1);
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[0].startsWith('/')) {
          drives.push({
            name: parts[0],
            mount: parts[5] || '',
            total: parts[1],
            used: parts[2],
            free: parts[3],
            usagePercent: parts[4]
          });
        }
      }
    } catch (e) {
      drives.push({ error: '无法获取磁盘信息' });
    }
  }
  
  return drives;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  checkDependencies,
  checkDiskSpace
};
