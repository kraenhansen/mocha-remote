import * as EventEmitter from "events";
import * as Mocha from "mocha";

export class MockedMocha extends Mocha {

  public run() {
    // Createa a fake runner and attach the client to it
    const runner = new EventEmitter() as Mocha.Runner;
    // Monkey patched version to mock a Mocha.Runner
    runner.run = function() {
      // A runner without tests emits a single start and an end event
      this.emit("start");
      this.emit("end");
      return this;
    };
    // Create and attach the reporter
    const Reporter = (this as any)._reporter as Mocha.ReporterConstructor;
    const reporter = new Reporter(runner, {});
    // Start the run asynchroniously to allow listeners to attach
    process.nextTick(() => {
      runner.run();
    });
    // Return the runner
    return runner;
  }
}
