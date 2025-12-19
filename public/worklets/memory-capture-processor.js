// AudioWorklet processor to capture mic input and send chunks + RMS to main thread
class MemoryCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      let sum = 0;
      // copy into a transferable buffer to avoid retaining the internal buffer
      const out = new Float32Array(ch.length);
      for (let i = 0; i < ch.length; i++) { const v = ch[i]; out[i] = v; sum += v * v; }
      const rms = Math.sqrt(sum / ch.length);
      this.port.postMessage({ t: 'chunk', rms, data: out }, [out.buffer]);
    }
    return true; // keep alive
  }
}

registerProcessor('memory-capture-processor', MemoryCaptureProcessor);

