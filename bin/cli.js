#!/usr/bin/env node

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const concurrently = require('concurrently');

const args = process.argv.slice(2);
const command = args[0];

// Helper to open a URL natively on the default browser
function openUrl(url) {
  const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${start} ${url}`);
}

// Helper to find the next available TCP port
function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(findAvailablePort(startPort + 1));
      } else {
        resolve(startPort);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve(startPort));
    });
    server.listen(startPort);
  });
}

// Helper to check if Docker is installed
function checkDocker() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

if (command === 'start') {
  console.log('🔍 Checking system requirements...');

  if (!checkDocker()) {
    console.error('\n❌ Error: Docker is not installed or not running on your machine.');
    
    if (process.platform === 'win32') {
      console.log('\n👉 WINDOWS DETECTED:');
      console.log('Please download and install Docker Desktop:');
      console.log('🔗 https://www.docker.com/products/docker-desktop/\n');
    } else if (process.platform === 'darwin') {
      console.log('\n👉 MACOS DETECTED:');
      console.log('Please download and install Docker Desktop:');
      console.log('🔗 https://www.docker.com/products/docker-desktop/\n');
    } else {
      console.log('\n👉 LINUX DETECTED:');
      console.log('Please install Docker using your package manager:');
      console.log('💻 Run: curl -fsSL https://get.docker.com | sh\n');
    }
    process.exit(1);
  }

  console.log('✅ Docker is running.');
  console.log('🚀 Booting Torollo System Lab...\n');

  const backendPath = path.join(__dirname, '../backend');
  const frontendPath = path.join(__dirname, '../frontend');

  (async () => {
    try {
      const frontendPort = await findAvailablePort(23232);
      const backendPort = await findAvailablePort(23233);

      const envContent = `window.TOROLLO_BACKEND_PORT = ${backendPort};`;

      // Ensure directory structures exist before writing env.js
      const publicPath = path.join(frontendPath, 'public');
      if (fs.existsSync(publicPath)) {
        fs.writeFileSync(path.join(publicPath, 'env.js'), envContent);
      }

      const distPath = path.join(frontendPath, 'dist');
      if (fs.existsSync(distPath)) {
        fs.writeFileSync(path.join(distPath, 'env.js'), envContent);
      }

      const { result } = concurrently(
        [
          { 
            command: `node ${path.join(backendPath, 'dist/server.js')}`, 
            name: 'backend', 
            env: { PORT: backendPort },
            prefixColor: 'blue' 
          },
          { 
            command: `npx vite preview --port ${frontendPort}`, 
            name: 'frontend', 
            cwd: frontendPath,
            prefixColor: 'green' 
          }
        ],
        {
          prefix: 'name',
          killOthers: ['failure', 'success'],
          silent: true
        }
      );

      console.log('================================================');
      console.log('🎉 Torollo System Lab is ready!');
      console.log(`🔗 Access it here: http://localhost:${frontendPort}`);
      console.log('================================================\n');

      // Automatically open browser tab
      setTimeout(() => {
        openUrl(`http://localhost:${frontendPort}`);
      }, 1200);

      await result;
    } catch (err) {
      console.error('Processes terminated:', err);
      process.exit(1);
    }
  })();

} else {
  console.log('Usage: torollo start');
  process.exit(0);
}
