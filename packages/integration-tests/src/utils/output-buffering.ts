import { Buffer } from "buffer";
import { PassThrough } from "stream";

const originalStdoutWrite = global.process.stdout.write;

/**
 * Enables output buffering and returns a method which when called:
 * Disables output buffering and returns a string of all the output buffered.
 */
export const enable = () => {
  const buffers: Buffer[] = [];
  const stream = new PassThrough();
  // Loop the stream into itself
  stream.on('data', chunk => {
    buffers.push(chunk);
  });
  // Monkey patch the write method of stdout
  (global.process.stdout as any).write = stream.write.bind(stream);
  // Return a method
  return () => {
    disable();
    stream.end();
    return Buffer.concat(buffers);
  };
};

export const disable = () => {
  global.process.stdout.write = originalStdoutWrite;
};
