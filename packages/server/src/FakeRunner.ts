import EventEmitter from "events";
import Mocha from "mocha";

// TODO: Consider actually implementing the Mocha.Runner interface

export class FakeRunner extends EventEmitter {
  static constants = Mocha.Runner.constants;
  public failures = 0;
  
  constructor() {
    super();
    // Count the number of failures
    this.on(FakeRunner.constants.EVENT_TEST_FAIL, () => {
      this.failures++;
    });
  }
}
