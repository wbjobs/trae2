const { execSync } = require('child_process');
const os = require('os');
const net = require('net');

const commonPorts = [
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
];

function getListeningPortsFromSystem() {
  const listeningPorts = new Set();
  const platform = os.platform();

  try {
    if (platform === 'win32') {
      const output = execSync('netstat -ano -p TCP', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const lines = output.trim().split('\n').slice(4);
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const state = parts[3];
          if (state === 'LISTENING') {
            const localAddr = parts[1];
            const portMatch = localAddr.match(/:(\d+)$/);
            if (portMatch) {
              const port = parseInt(portMatch[1]);
              if (!isNaN(port)) {
                listeningPorts.add(port);
              }
            }
          }
        }
      }
    } else {
      let output = '';
      let success = false;
      
      try {
        output = execSync('ss -tln 2>/dev/null', { encoding: 'utf8' });
        success = true;
      } catch (e) {}
      
      if (!success || !output.trim()) {
        try {
          output = execSync('netstat -tln 2>/dev/null', { encoding: 'utf8' });
          success = true;
        } catch (e) {}
      }
      
      if (!success || !output.trim()) {
        try {
          output = execSync('lsof -i -P -n -sTCP:LISTEN 2>/dev/null', { encoding: 'utf8' });
          success = true;
        } catch (e) {}
      }
      
      if (output) {
        const lines = output.trim().split('\n');
        for (const line of lines) {
          if (line.includes('LISTEN') || (line.includes(':') && !line.startsWith('State') && !line.startsWith('Active'))) {
            const portMatch = line.match(/:(\d+)\s/);
            if (portMatch) {
              const port = parseInt(portMatch[1]);
              if (!isNaN(port)) {
                listeningPorts.add(port);
              }
            }
          }
        }
      }
    }
  } catch (e) {
  }
  
  return listeningPorts;
}

function scanPortWithSocket(port, host = '127.0.0.1', timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    
    const done = (isOpen) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(isOpen);
      }
    };
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      done(true);
    });
    
    socket.on('timeout', () => {
      done(false);
    });
    
    socket.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        done(false);
      } else if (err.code === 'EACCES' || err.code === 'EPERM') {
        done(false);
      } else {
        done(false);
      }
    });
    
    socket.connect(port, host, () => {
      done(true);
    });
    
    setTimeout(() => done(false), timeout + 1000);
  });
}

async function scanPort(port) {
  const systemPorts = getListeningPortsFromSystem();
  const systemDetected = systemPorts.has(port);
  
  if (systemDetected) {
    return { port, status: 'open', method: 'system' };
  }
  
  const socketResult = await scanPortWithSocket(port);
  
  if (socketResult) {
    return { port, status: 'open', method: 'socket' };
  }
  
  return { port, status: 'closed', method: 'system' };
}

async function scanPorts(portRange = null, config = {}) {
  const results = [];
  let portsToScan = [];
  const customPorts = config.ports || null;
  
  if (portRange) {
    const [start, end] = portRange.split('-').map(Number);
    for (let i = start; i <= end; i++) {
      portsToScan.push(i);
    }
  } else if (customPorts) {
    portsToScan = customPorts.map(p => typeof p === 'object' ? p.port : p);
  } else {
    portsToScan = commonPorts.map(p => p.port);
  }
  
  const systemPorts = getListeningPortsFromSystem();
  const needSocketScan = [];
  
  for (const port of portsToScan) {
    if (systemPorts.has(port)) {
      results.push({ port, status: 'open', method: 'system' });
    } else {
      needSocketScan.push(port);
    }
  }
  
  const batchSize = config.scan?.batchSize || 10;
  const timeout = config.scan?.timeout || 2000;
  
  for (let i = 0; i < needSocketScan.length; i += batchSize) {
    const batch = needSocketScan.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(port => scanPortWithSocket(port, '127.0.0.1', timeout).then(isOpen => ({
        port,
        status: isOpen ? 'open' : 'closed',
        method: 'socket'
      })))
    );
    results.push(...batchResults);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const portNameMap = {};
  if (customPorts) {
    customPorts.forEach(p => {
      if (typeof p === 'object') {
        portNameMap[p.port] = p.name;
      }
    });
  }
  commonPorts.forEach(p => {
    if (!portNameMap[p.port]) {
      portNameMap[p.port] = p.name;
    }
  });
  
  return results.map(r => ({
    port: r.port,
    status: r.status,
    name: portNameMap[r.port] || '未知'
  })).sort((a, b) => a.port - b.port);
}

function getPortProcesses() {
  const results = [];
  const platform = os.platform();
  
  if (platform === 'win32') {
    try {
      const output = execSync('netstat -ano', { encoding: 'utf8' });
      const lines = output.trim().split('\n').slice(4);
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1]) {
          const localAddr = parts[1];
          const portMatch = localAddr.match(/:(\d+)$/);
          if (portMatch) {
            const port = parseInt(portMatch[1]);
            const pid = parts[parts.length - 1];
            const proto = parts[0];
            const state = parts[3] || '';
            
            if (!isNaN(port) && !results.find(r => r.port === port && r.proto === proto && r.state === 'LISTENING')) {
              results.push({
                port,
                proto,
                state,
                pid: pid === '*' ? null : pid
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('获取端口进程信息失败:', e.message);
    }
  } else {
    try {
      let output = '';
      try {
        output = execSync('ss -tulnp 2>/dev/null', { encoding: 'utf8' });
      } catch (e) {
        try {
          output = execSync('netstat -tulpn 2>/dev/null', { encoding: 'utf8' });
        } catch (e2) {
          output = execSync('lsof -i -P -n 2>/dev/null', { encoding: 'utf8' });
        }
      }
      
      const lines = output.trim().split('\n');
      
      for (const line of lines) {
        if (line.includes('LISTEN') || (line.includes(':') && !line.startsWith('State') && !line.startsWith('Active') && !line.startsWith('COMMAND'))) {
          const parts = line.trim().split(/\s+/);
          const portMatch = line.match(/:(\d+)/);
          if (portMatch) {
            const port = parseInt(portMatch[1]);
            if (!isNaN(port) && !results.find(r => r.port === port)) {
              let pid = 'N/A';
              let process = 'N/A';
              
              const pidMatch = line.match(/pid=(\d+)/) || line.match(/(\d+)\/\w+/);
              if (pidMatch) {
                pid = pidMatch[1];
              }
              
              results.push({
                port,
                pid,
                process,
                proto: parts[0] || 'N/A'
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('获取端口进程信息失败:', e.message);
    }
  }
  
  return results.sort((a, b) => a.port - b.port);
}

module.exports = {
  scanPorts,
  getPortProcesses,
  commonPorts
};
