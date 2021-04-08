import { ErrorMessage } from "../ErrorMessage";

export type EventMessage = { action: "event", name: string, args: unknown[] };
export type ServerMessage = ErrorMessage | EventMessage;
