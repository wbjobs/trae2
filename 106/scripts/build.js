const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');

function log(message) {
  console.log(`\x1b[36m[Build]\x1b[0m ${message}`);
}

function error(message) {
  console.error(`\x1b[31m[Error]\x1b[0m ${message}`);
  process.exit(1);
}

function runCommand(command, cwd = rootDir) {
  log(`Running: ${command}`);
  try {
    execSync(command, { cwd, stdio: 'inherit', shell: true });
  } catch (e) {
    error(`Command failed: ${command}`);
  }
}

function buildCpp() {
  log('Building C++ backend...');
  const cppDir = path.join(rootDir, 'cpp-backend');
  const buildDir = path.join(cppDir, 'build');

  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  runCommand('cmake -B build -S . -DCMAKE_BUILD_TYPE=Release', cppDir);
  runCommand('cmake --build build --config Release', cppDir);
  log('C++ backend built successfully');
}

function buildAddon() {
  log('Building native addon...');
  const addonDir = path.join(rootDir, 'native-addon');
  runCommand('npm install', addonDir);
  runCommand('node-gyp rebuild', addonDir);
  log('Native addon built successfully');
}

function buildElectron() {
  log('Building Electron app...');
  runCommand('npm install', rootDir);
  runCommand('npx tsc -p electron/tsconfig.json', rootDir);
  log('Electron app built successfully');
}

function packageApp() {
  log('Packaging Electron app...');
  runCommand('npm run package', rootDir);
  log('Electron app packaged successfully');
}

function main() {
  const args = process.argv.slice(2);
  const target = args[0] || 'all';

  log(`Starting build for target: ${target}`);
  console.log('');

  switch (target) {
    case 'cpp':
      buildCpp();
      break;
    case 'addon':
      buildAddon();
      break;
    case 'electron':
      buildElectron();
      break;
    case 'package':
      packageApp();
      break;
    case 'all':
      buildCpp();
      console.log('');
      buildAddon();
      console.log('');
      buildElectron();
      break;
    default:
      error(`Unknown target: ${target}`);
  }

  console.log('');
  log('Build completed successfully!');
}

main();
