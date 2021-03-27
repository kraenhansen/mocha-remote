export type ErrorMessage = { action: "error", message: string };
export type EventMessage = { action: "event", name: string, args: unknown[] };
export type ServerMessage = ErrorMessage | EventMessage;
