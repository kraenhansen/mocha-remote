export type CustomContext = Record<string, unknown>;

export type MochaConfig = {
  grep?: RegExp | string;
  invert?: boolean;
  context?: CustomContext;
  timeout?: number;
  slow?: number;
};

export type ErrorMessage = { action: "error", message: string };
export type RunMessage = { action: "run", options: Partial<MochaConfig> };
export type ClientMessage = ErrorMessage | RunMessage;
