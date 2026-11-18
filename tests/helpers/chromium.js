const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { availableParallelism } = require('node:os');

function launchChromium(executable, args) {
  assert.equal(availableParallelism(), 1, 'Run Chromium through sh tests/run.sh to inherit a single CPU.');
  return spawn(executable, ['--renderer-process-limit=1', '--num-raster-threads=1', ...args]);
}

module.exports = { launchChromium };
