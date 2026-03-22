const path = require('path');
const { spawn } = require('child_process');

function startEmbeddedMlService() {
  if (process.env.EMBEDDED_ML_SERVICE !== '1') {
    return null;
  }

  const pythonBin = process.env.PYTHON_BIN || 'python';
  const scriptPath = path.resolve(__dirname, '../../../ml_service/main.py');

  const child = spawn(pythonBin, [scriptPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      ML_SERVICE_PORT: process.env.ML_SERVICE_PORT || '8000',
    },
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[embedded-ml] ${chunk}`);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[embedded-ml] ${chunk}`);
  });

  child.on('exit', (code, signal) => {
    console.warn(`[embedded-ml] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
  });

  return child;
}

module.exports = { startEmbeddedMlService };
