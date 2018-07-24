const timingsPattern = /\d+ms/g;

export const removeTimings = (text: string) => {
  return text.replace(timingsPattern, "?ms");
};

export * from "./mocked-mocha";

import * as ob from "./output-buffering";
export { ob };
