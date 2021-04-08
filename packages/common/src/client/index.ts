export type CustomContext = Record<string, unknown>;

export type MochaConfig = {
  grep?: RegExp | string;
  invert?: boolean;
  context?: CustomContext
};

export type ErrorMessage = { action: "error", message: string };
export type RunMessage = { action: "run", options: Partial<MochaConfig> };
export type ClientMessage = ErrorMessage | RunMessage;
