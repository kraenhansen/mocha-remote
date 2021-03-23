declare module "flatted" {
  function parse(test: string): unknown;
  function stringify(value: unknown): string;
  export { parse, stringify };
}
