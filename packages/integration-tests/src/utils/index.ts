const timingsPattern = /\d+ms/g;

export function removeTimings(text: string): string {
  return text.replace(timingsPattern, "?ms");
};

export function replaceTestPath(text: string, actualPath: string): string {
  return text.split("/mocha-remote-client/mocked-test-suite.js").join(actualPath);
};

export function delay(timeout: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

export * from "./mocked-mocha";

import * as ob from "./output-buffering";
export { ob };
