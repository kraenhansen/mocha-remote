declare module "flatted" {
  function parse(test: string): unknown;
  function stringify(value: any): string;
  export { parse, stringify };
}
