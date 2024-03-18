import { expect } from 'chai';
import { WebSocketServer } from "ws";
import * as flatted from "flatted";

import { Client } from './Client';

const reconnectDelay = 50;

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

    const failures = await new Promise(async resolve => {
      const runner = await client.run(resolve);
      // The total number of tests should only include grepped
      expect(runner.total).equals(2);
    })

    // We expect that all tests has been loaded now
    expect(client.suite.tests.length).equals(3);

    expect(failures).equals(1);
    expect(ran).deep.equals(["a", "b"]);
  });

  it("propagates 'timeout' and 'slow'", async () => {
    const TIMEOUT = 10;
    const SLOW = TIMEOUT / 2;
    const client = new Client({
      autoConnect: false,
      timeout: TIMEOUT,
      slow: SLOW,
      tests: () => {
        it("is slow", async () => {
          await new Promise(resolve => setTimeout(resolve, TIMEOUT + 10));
        });
      }
    });

    const runner = await new Promise<Mocha.Runner>(resolve => {
      const runner = client.run(() => {
        resolve(runner);
      });
    })

    expect(runner.failures).equals(1);
    const [test] = runner.suite.tests;
    // Assert the configuration propagates to the tests
    expect(test.timeout()).equals(TIMEOUT);
    expect(test.slow()).equals(SLOW);
    // Assert the test has failed due to a timeout
    expect(test.isFailed()).equals(true);
    expect(test.timedOut).equals(true);
  });

  it("calls tests with a context", async () => {
    const recursive: Record<string, unknown> = {};
    recursive.child = recursive;

    const context: Record<string, unknown> = {
      greeting: "hello world",
      number: 1337,
      yes: true,
      run: 0,
      recursive,
    };

    const updates: Record<string, unknown> = {};

    const client = new Client({
      autoConnect: false,
      context,
      tests: actualContext => {
        expect(actualContext).deep.equals({ ...context, ...updates });
      }
    });

    await new Promise(resolve => client.run(resolve));
    // Increase the run count and run again, providing the updated value an update to the context when running
    updates.run = 1;
    await new Promise(resolve => client.run(resolve, { context: { run: 1 } }));
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

    const failures1 = await new Promise(async resolve => {
      const runner = await client.run(resolve);
      expect(runner.total).equals(1);
    })
    // We expect that all tests has been loaded now
    expect(client.suite.tests.length).equals(1);

    expect(failures1).equals(1);
    expect(ran).deep.equals(["a"]);

    // One more time

    const failures2 = await new Promise(async resolve => {
      const runner = await client.run(resolve);
      expect(runner.total).equals(1);
    })

    // We expect that all tests has been loaded now
    expect(client.suite.tests.length).equals(1);

    expect(failures2).equals(1);
    expect(ran).deep.equals(["a", "a"]);
  });


  describe("connecting", () => {
    let wss: WebSocketServer;
    let url: string;

    beforeEach(() => {
      wss = new WebSocketServer({ port: 0 });
      const address = wss.address();
      if (typeof address === "object") {
        if (address.family === "IPv6") {
          url = `ws://[${address.address}]:${address.port}`;
        } else {
          url = `ws://${address.address}:${address.port}`;
        }
      }
    });

    afterEach(async () => {
      // Terminate all clients
      for (const ws of wss.clients) {
        ws.terminate();
      }
      await new Promise(resolve => wss.close(resolve));
    });

    it("reconnects until server is up", async () => {
      const { port } = wss.address() as WebSocket.AddressInfo;
      // Shut down the server before the client gets a chance to connect
      wss.close();
      // Start connecting
      const client = new Client({ url, reconnectDelay });
      // Wait for a couple of attempts
      await new Promise(resolve => setTimeout(resolve, reconnectDelay * 2));
      // Start the server (using the same port as initially)
      wss = new WebSocketServer({ port });
      await Promise.all([
        new Promise(resolve => client.once("connection", resolve)),
        new Promise(resolve => wss.once("connection", resolve)),
      ]);
      // Disconnect gracefully
      client.disconnect();
    });

    it("connects, reconnects and stops when disconnected", async () => {
      const expectedRetries = 3;

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
        client.on("connection", () => {
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

    /*
    it.skip("throws when disconnected while reconnecting", async () => {
      const client = new Client({ url, reconnectDelay });
    });
    */

    it("runs tests when asked", async () => {
      wss.on("connection", ws =>  {
        ws.send(flatted.stringify({
          action: "run",
          options: {
            grep: "will",
            context: { greeting: "hi" },
          },
        }));
      });

      const failures = await new Promise<number>(resolve => {
        const client = new Client({
          url,
          autoReconnect: false,
          tests: (context) => {
            // Expect that the context is passed from the server
            expect(context).deep.equals({
              greeting: "hi",
            });
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
        const client = new Client({ url, autoReconnect: false });
        client.once("error", err => {
          expect(err).instanceof(Error);
          expect(err.message.startsWith("connect ECONNREFUSED"));
          resolve();
        });
      });
    });

    it("emits error when loading of tests fail", async () => {
      const clientResponse = new Promise<void>(resolve => {
        wss.on("connection", ws => {
          ws.send(flatted.stringify({
            action: "run",
            options: {},
          }));

          ws.on("message", data => {
            const msg = flatted.parse(data as string);
            expect(msg.action).equals("error");
            expect(msg.message).equals("b00m!");
            resolve();
          });
        });
      });

      await new Promise<void>(resolve => {
        const client = new Client({
          url,
          autoReconnect: false,
          tests: () => {
            throw new Error("b00m!");
          },
        });

        client.once("error", err => {
          expect(err).instanceof(Error);
          expect(err.message).equals("b00m!");
          resolve();
        });
      });

      await clientResponse;
    });

    it("emits error on malformed messages", async () => {
      wss.on("connection", ws => {
        ws.send('');
        ws.send('{}');
        ws.send('[]');
        ws.send(flatted.stringify({}));
        ws.send(flatted.stringify({ "action": "unexpected" }));
        ws.send(flatted.stringify({ "action": "run" }));
        ws.send(flatted.stringify({ "action": "error" }));
      });

      const EXPECTED_MESSAGES = [
        "Failed to parse flatted JSON: Unexpected end of JSON input",
        "Failed to parse flatted JSON: $parse(...).map is not a function",
        "Failed to parse flatted JSON: Cannot read properties of undefined (reading 'action')",
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
        client.once("disconnection", () => {
          resolve();
        });
      });

      expect(messages).deep.equals(EXPECTED_MESSAGES);
    });

    it("sends runner events when emitted", async () => {
      const messages: Record<string, unknown>[] = [];
      const runEnded = new Promise<void>(resolve => {
        wss.on("connection", ws => {
          ws.on("message", (msg: string) => {
           const parsed = flatted.parse(msg);
           messages.push(parsed);
           if (parsed.action === "event" && parsed.name === "end") {
             resolve();
           }
          });
        });
      });
      const client = new Client({
        autoConnect: false,
        autoReconnect: false,
        url,
        tests() {
          it("runs", () => {
            // Tumbleweed
          });
        }
      });
      await client.connect();
      await new Promise(resolve => client.run(resolve));
      await runEnded;
      const eventNames = messages.filter(({ action }) => action === "event").map(({ name }) => name);
      expect(eventNames).deep.equals(["start", "suite", "test", "pass", "test end", "suite end", "end"]);
    });
  });
});