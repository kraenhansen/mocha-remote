declare module "flatted" {
  function parse(test: string): object;
  function stringify(value: any): string;
  export { parse, stringify };
}
