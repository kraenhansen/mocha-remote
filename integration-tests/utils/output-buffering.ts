import { Buffer } from "buffer";

const originalStdoutWrite = global.process.stdout.write;

function mock(buffers: Buffer[], output: string | Buffer, fn?: () => void) {
  // Convert a string sent to the stream into a buffer
  const buffer = typeof(output) === "string" ? Buffer.from(output, "utf8") : output;
  // Add this buffer to all buffers written to the stream
  buffers.push(buffer);
  // Call any callback to indicate a successful write
  if (fn) { fn(); }
  return true;
}

export const enable = () => {
  const stdoutBuffers: Buffer[] = [];
  global.process.stdout.write = mock.bind(null, stdoutBuffers);
  return () => {
    disable();
    return Buffer.concat(stdoutBuffers);
  };
};

export const disable = () => {
  global.process.stdout.write = originalStdoutWrite;
};
