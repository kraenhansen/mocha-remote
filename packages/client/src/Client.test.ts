import { expect } from 'chai';
import ws from "ws";

import { Runner } from ".";
import { Client } from './Client';

describe("Mocha Remote Client", () => {
  it("constructs", () => {
    const client = new Client({
      autoConnect: false,
      tests: () => {
        describe("something", () => {
          it("works", () => {
            // Tumbleweed
          });
        });
      }
    });

    expect(client.suite.root).equals(true);
  });

  it("greps", async () => {
    const ran: string[] = [];
    const client = new Client({
      autoConnect: false,
      grep: "will",
      tests: () => {
        it("will succeed", () => {
          ran.push("a");
        });

        it("will fail", () => {
          ran.push("b");
          throw new Error("Expected failure");
        });

        it("wont run", () => {
          ran.push("c");
        });
      }
    });

    // We expect that no tests are loaded before running
    expect(client.suite.tests.length).equals(0);

    const failures = await new Promise(resolve => {
      const runner = client.run(resolve);
      // We expect that all tests has been loaded now
      expect(client.suite.tests.length).equals(3);
      // The total number of tests should only include grepped
      expect(runner.total).equals(2);
    })

    expect(failures).equals(1);
    expect(ran).deep.equals(["a", "b"]);
  });

  it("re-runs", async () => {
    const ran: string[] = [];
    const client = new Client({
      autoConnect: false,
      tests: () => {
        it("will fail", () => {
          ran.push("a");
          throw new Error("Expected failure");
        });
      }
    });

    // We expect that no tests are loaded before running
    expect(client.suite.tests.length).equals(0);

    const failures1 = await new Promise(resolve => {
      const runner = client.run(resolve);
      // We expect that all tests has been loaded now
      expect(client.suite.tests.length).equals(1);
      // The total number of tests should only include grepped
      expect(runner.total).equals(1);
    })

    expect(failures1).equals(1);
    expect(ran).deep.equals(["a"]);

    // One more time ... will register a new test since the calling the tests() is not memorized

    const failures2 = await new Promise(resolve => {
      const runner = client.run(resolve);
      // We expect that all tests has been loaded now
      expect(client.suite.tests.length).equals(2);
      // The total number of tests should only include grepped
      expect(runner.total).equals(2);
    })

    expect(failures2).equals(2);
    expect(ran).deep.equals(["a", "a", "a"]);
  });


  describe("connecting", () => {
    let wss: ws.Server;
    let url: string;

    beforeEach(() => {
      wss = new ws.Server({ port: 0 });
      const address = wss.address();
      if (typeof address === "object") {
        url = `ws://localhost:${address.port}`;
      }
    });

    afterEach(() => {
      wss.close();
    });

    it("connects, reconnects and stops when disconnected", async () => {
      const expectedRetries = 3;
      const reconnectDelay = 50;

      let clientConnections = 0;
      let serverConnections = 0;

      // Count every reconnection attempt
      wss.on("connection", socket => {
        serverConnections++;
        socket.close();
      });

      await new Promise<void>(resolve => {
        const client = new Client({ url, reconnectDelay });
        // Count connections
        client.on("connect", () => {
          clientConnections++;
          if (clientConnections >= expectedRetries) {
            // Disconnecting should prevent any future reconnects
            client.disconnect();
            resolve();
          }
        });
        // TODO: Test that errors are reported
      });

      // Wait for any new reconnects ...
      await new Promise(resolve => setTimeout(resolve, reconnectDelay * 2));

      expect(clientConnections).equals(serverConnections);
      expect(serverConnections).equals(expectedRetries);
    });

    it("runs tests when asked", async () => {
      wss.on("connection", ws => {
        ws.send(JSON.stringify({ action: "run", options: { grep: "will" } }));
      });

      const failures = await new Promise<number>(resolve => {
        const client = new Client({
          url,
          autoReconnect: false,
          tests: () => {
            it("will fail", () => {
              throw new Error("Expected failure");
            });
            it("wont run", () => {
              throw new Error("Unexpected failure");
            });
          },
        });
        // Resolve once the tests have ended
        client.once("end", resolve);
      });

      expect(failures).equals(1);
    });

    it("emits error when connetion fails", async () => {
      // Close the server right away to provoke a connection failure
      wss.close();
      await new Promise<void>(resolve => {
        const client = new Client({ url });
        client.once("error", err => {
          expect(err).instanceof(Error);
          expect(err.message.startsWith("connect ECONNREFUSED"));
          resolve();
        });
      });
    });

    it("emits error on malformed messages", async () => {
      wss.on("connection", ws => {
        ws.send('');
        ws.send('{}');
        ws.send('{ "action": "unexpected" }');
        ws.send('{ "action": "run" }');
        ws.send('{ "action": "error" }');
      });

      const EXPECTED_MESSAGES = [
        "Unexpected end of JSON input",
        "Expected an action property",
        "Unexpected action 'unexpected'",
        "Expected an options object on 'run' actions",
        "Expected 'error' action to have an error argument with a message"
      ];

      const messages: string[] = [];

      await new Promise<void>(resolve => {
        const client = new Client({ url });
        client.once("error", err => {
          expect(err).instanceof(Error);
          messages.push(err.message);
          // Disconnect when all messages have been received
          if (messages.length >= EXPECTED_MESSAGES.length) {
            client.disconnect();
          }
        });
        client.once("disconnect", () => {
          resolve();
        });
      });

      expect(messages).deep.equals(EXPECTED_MESSAGES);
    });
  });
});