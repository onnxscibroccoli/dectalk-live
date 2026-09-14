let wasmModule = null;

function allocCString(mod, str) {
  const bytes = new TextEncoder().encode(`${str}\0`);
  const ptr = mod._malloc(bytes.length);
  mod.HEAPU8.set(bytes, ptr);
  return ptr;
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === "init") {
      const { default: initializer } = await import("./dectalk.js");
      wasmModule = await initializer({ PTHREAD_POOL_SIZE: 8 });
      self.postMessage({ type: "ready" });
      return;
    }

    if (msg.type === "synthesize") {
      if (!wasmModule) throw new Error("Engine is not initialized");
      const text = String(msg.text ?? "");
      if (!text.trim()) throw new Error("Nothing to speak");

      const textPtr = allocCString(wasmModule, text);
      const filePtr = allocCString(wasmModule, "out.wav");
      try {
        const code = await wasmModule._synthesize(
          textPtr,
          filePtr,
          Number(msg.voice) || 0,
          Number(msg.rate) || 150,
        );
        if (code !== 0) {
          throw new Error(`synthesize exited with code ${code}`);
        }
        const wav = wasmModule.FS.readFile("out.wav");
        const copy = Uint8Array.from(wav);
        self.postMessage({ type: "result", id: msg.id, wav: copy }, [copy.buffer]);
      } finally {
        wasmModule._free(textPtr);
        wasmModule._free(filePtr);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: "error", id: msg?.id ?? 0, message });
  }
};
