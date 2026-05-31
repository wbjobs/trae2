const { spawn } = require('child_process');
const path = require('path');

const services = [
  {
    name: 'gateway',
    cwd: path.join(__dirname, '..'),
    script: 'backend/gateway.js',
    port: 3000
  },
  {
    name: 'tile-service',
    cwd: path.join(__dirname, '..', 'backend', 'services', 'tile-service'),
    script: 'server.js',
    port: 3001
  },
  {
    name: 'spatial-index',
    cwd: path.join(__dirname, '..', 'backend', 'services', 'spatial-index'),
    script: 'server.js',
    port: 3002
  },
  {
    name: 'frontend',
    cwd: path.join(__dirname, '..', 'frontend'),
    command: 'npm',
    args: ['run', 'dev'],
    port: 8080
  }
];

const processes = [];

function startService(service) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Starting ${service.name}...`);
    
    const command = service.command || 'node';
    const args = service.args || [service.script];
    
    const child = spawn(command, args, {
      cwd: service.cwd,
      env: { ...process.env, PORT: service.port },
      stdio: 'pipe'
    });

    child.stdout.on('data', (data) => {
      process.stdout.write(`[${service.name}] ${data.toString()}`);
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(`[${service.name}][ERROR] ${data.toString()}`);
    });

    child.on('error', (error) => {
      console.error(`❌ ${service.name} error:`, error);
      reject(error);
    });

    child.on('close', (code) => {
      console.log(`\n⚠️  ${service.name} exited with code ${code}`);
    });

    processes.push({ name: service.name, process: child });
    
    setTimeout(resolve, service.name === 'frontend' ? 3000 : 1000);
  });
}

async function startAll() {
  console.log('='.repeat(60));
  console.log('🎯 Point Cloud Rendering System');
  console.log('='.repeat(60));

  try {
    for (const service of services) {
      await startService(service);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All services started!');
    console.log('='.repeat(60));
    console.log(`\n📋 Services:
  • Gateway:        http://localhost:3000
  • Tile Service:     http://localhost:3001
  • Spatial Index:    http://localhost:3002
  • Frontend:         http://localhost:8080
`);
    console.log('='.repeat(60));
    console.log('\n🌐 Open your browser and visit: http://localhost:8080');
    console.log('\nPress Ctrl+C to stop all services\n');

  } catch (error) {
    console.error('❌ Failed to start services:', error);
    process.exit(1);
  }
}

function cleanup() {
  console.log('\n\n🛑 Shutting down all services...');
  
  for (const { name, process: proc } of processes) {
    console.log(`  Stopping ${name}...`);
    proc.kill('SIGINT');
  }
  
  setTimeout(() => {
    console.log('\n✅ All services stopped.');
    process.exit(0);
  }, 1500);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

startAll();
