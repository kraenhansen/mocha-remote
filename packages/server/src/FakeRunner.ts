import EventEmitter from "events";
import Mocha from "mocha";

// TODO: Consider actually implementing the Mocha.Runner interface

export class FakeRunner extends EventEmitter {
  stats?: Mocha.Stats = {
    suites: 0,
    tests: 0,
    passes: 0,
    pending: 0,
    failures: 0
  };
}
