import EventEmitter from "events";
import Mocha from "mocha";

// TODO: Consider actually implementing the Mocha.Runner interface
const suiteCache: Map<string, Mocha.Suite> = new Map();

type MochaReference = {
  __mocha_id__: string;
};

function assertMochaReference(value: unknown): asserts value is MochaReference {
  if (typeof value !== "object" || value === null || !("__mocha_id__" in value)) {
    throw new Error("Expected a suite with a '__mocha_id__' property");
  }
}

export class FakeRunner extends EventEmitter {
  static constants = Mocha.Runner.constants;
  public failures = 0;
  public suite: Mocha.Suite | null = null;
  
  constructor() {
    super();
    // Count the number of failures
    this.on(FakeRunner.constants.EVENT_TEST_FAIL, () => {
      this.failures++;
    });

    // Reconstruct the tree of suites
    this.on(FakeRunner.constants.EVENT_SUITE_BEGIN, (suite: Mocha.Suite) => {
      assertMochaReference(suite);
      // Store the suite for later
      suiteCache.set(suite.__mocha_id__, suite);
      // Expose the root suite on the runner
      if (suite.root) {
        this.suite = suite;
        return;
      }
      // Ensure the parent suite has this as a child
      assertMochaReference(suite.parent);
      const { __mocha_id__: parentId } = suite.parent;
      const parentSuite = suiteCache.get(parentId);
      // We've already seen the parent suite
      if (!parentSuite) {
        throw new Error(`A suite referenced a parent suite (id = ${parentId}), which didn't already begin`)
      }
      const alreadyInserted = parentSuite.suites.some((childSuite) => {
        assertMochaReference(childSuite);
        return childSuite.__mocha_id__ === suite.__mocha_id__;
      });
      if (!alreadyInserted) {
        parentSuite.suites.push(suite);
      }
    });
  }
}
