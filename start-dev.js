const { spawn } = require('child_process');
const os = require('os');

const platform = os.platform();

let command, args;

if (platform === 'win32') {
    console.log("⚙️  Detected Windows OS. Running start-dev.bat...");
    command = 'cmd.exe';
    args = ['/c', 'start-dev.bat'];
} else if (platform === 'darwin') {
    console.log("🍏 Detected macOS. Running start-dev.command...");
    command = 'sh';
    args = ['./start-dev.command'];
} else {
    console.log("🐧 Detected Linux/Unix. Running start-dev.sh...");
    command = 'sh';
    args = ['./start-dev.sh'];
}

const child = spawn(command, args, { stdio: 'inherit' });

child.on('error', (error) => {
    console.error(`❌ Error starting development script: ${error.message}`);
});

child.on('exit', (code) => {
    if (code !== 0) {
        console.error(`❌ Development script exited with code ${code}`);
    } else {
        console.log("✅ Development script detached/finished.");
    }
});
