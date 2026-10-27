// Minimal Web Audio graph with observable scheduling and resource cleanup.
function createAudioContext({ currentTime = 0, state = 'running', sampleRate = 8000 } = {}) {
  const context = {
    currentTime, state, sampleRate, destination: {}, nodes: [], buffers: [],
    resume() { this.state = 'running'; return Promise.resolve(); }
  };
  function parameter(node, name) {
    return {
      setValueAtTime(value, time) { node.automation.push([name, 'set', value, time]); },
      exponentialRampToValueAtTime(value, time) { node.automation.push([name, 'ramp', value, time]); }
    };
  }
  function node(kind) {
    const result = {
      kind, automation: [], connections: [], starts: [], stops: [], disconnects: 0,
      connect(next) { this.connections.push(next); },
      disconnect() { this.disconnects++; },
      start(time = context.currentTime) { this.starts.push(time); },
      stop(time = context.currentTime) { this.stops.push(time); }
    };
    context.nodes.push(result);
    return result;
  }
  context.createOscillator = () => {
    const result = node('oscillator'); result.frequency = parameter(result, 'frequency'); return result;
  };
  context.createGain = () => {
    const result = node('gain'); result.gain = parameter(result, 'gain'); return result;
  };
  context.createBiquadFilter = () => {
    const result = node('filter'); result.frequency = parameter(result, 'frequency'); return result;
  };
  context.createBufferSource = () => node('bufferSource');
  context.createBuffer = (channels, length, rate) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    const result = { numberOfChannels: channels, length, sampleRate: rate, getChannelData: index => data[index] };
    context.buffers.push(result);
    return result;
  };
  return context;
}

module.exports = { createAudioContext };
