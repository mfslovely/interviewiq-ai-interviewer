// Build tooling only. The production HTTP server is Python/Uvicorn.
import { spawnSync } from 'node:child_process';
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
if (process.env.RENDER) {
  run('python3', ['-m', 'venv', '.venv']);
  run('.venv/bin/python', ['-m', 'pip', 'install', '-r', 'requirements.txt']);
}
