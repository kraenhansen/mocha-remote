export type MochaConfig = {
  grep?: RegExp | string;
  delay?: boolean;
  invert?: boolean;
};

export type ErrorMessage = { action: "error", message: string };
export type RunMessage = { action: "run", options: Partial<MochaConfig> };
export type ClientMessage = ErrorMessage | RunMessage;
