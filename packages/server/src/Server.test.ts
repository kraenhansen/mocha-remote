import { expect } from "chai";
import { WebSocket } from "ws";
import flatted from "flatted";
import { ChildProcess, fork } from "child_process";
import { resolve } from "path";

import { Server } from "./Server";

const protocol = `mocha-remote-${Server.DEFAULT_CONFIG.id}`;

describe("Mocha Remote Server", () => {
  it("can initialize", () => {
    const server = new Server();
    expect(server).to.be.an("object");
  });

  it("can start, run and stop", async () => {
    // Create and start the server
    const server = new Server({ port: 0, reporter: "base" });
    await server.start();

    const client = new WebSocket(server.url, protocol);

    client.once("message", message => {
      const { action } = flatted.parse(message.toString());
      if (action === "run") {
        client.send(flatted.stringify({ action: "event", name: "end" }));
      }
    });

    // A promose that resolves when the client tells the server the root suite ended
    const serverEnded = new Promise<void>(resolve => server.once("end", resolve));

    await server.runAndStop();
    await serverEnded;
  });

  it("propagates context", async () => {
    // Create and start the server
    const server = new Server({
      port: 0,
      reporter: "base",
      context: {
        greeting: "hi",
      },
    });
    await server.start();

    const client = new WebSocket(server.url, protocol);

    client.once("message", message => {
      const { action, options } = flatted.parse(message.toString());
      if (action === "run") {
        // Expect the context to propagate
        expect(options.context).deep.equals({ greeting: "hi" });
        client.send(flatted.stringify({ action: "event", name: "end" }));
      }
    });

    await server.runAndStop();
  });

  it("rejects the run process, on errors", async () => {
    // Create and start the server
    const server = new Server({
      port: 0,
      reporter: "base",
      context: {
        greeting: "hi",
      },
    });
    await server.start();

    const client = new WebSocket(server.url, protocol);

    client.once("message", message => {
      const { action } = flatted.parse(message.toString());
      if (action === "run") {
        // Send back an error
        client.send(flatted.stringify({ action: "error", message: "Something happened" }));
      }
    });

    // Expect the promise returned from running to get rejected
    try {
      await server.runAndStop();
      throw new Error("Expected a rejected promise");
    } catch (err) {
      if (err instanceof Error) {
        expect(err.message).contains("Something happened");
      } else {
        throw new Error(`Expected an error, got ${err}`);
      }
    }
  });

  const startRemoteClient = (script: string, server: Server) => {
    return new Promise<ChildProcess>((resolve) => {
      const clientProcess = fork(script, { stdio: "inherit" });
      const onConnection = () => {
        cleanup();
        resolve(clientProcess);
      };
      const cleanup = () => {
        server.off("connection", onConnection);
      }
      server.on("connection", onConnection);
    });
  };

  const stopRemoteClient = (childClientProcess: ChildProcess) => {
    return new Promise<void>((resolve, reject) => {
      childClientProcess.once("exit", () => {
        resolve();
      });
      childClientProcess.kill();
    });
  };

  const runTests = (server: Server) => {
    return new Promise<number>((resolve, reject) => {
      server.run((failures) => {
        resolve(failures);
      });
    });
  };

  it("should be able to start again, when the server is stopped during a run", async () => {
    // Create and start the server
    const server = new Server({
      port: 8090,
      reporter: "base",
      autoRun: false,
    });

    await server.start();

    const clientThatHangsScriptPath = resolve(__dirname, "../fixtures/clientVeryLongRun.js");
    const childClientProcess = await startRemoteClient(clientThatHangsScriptPath, server);

    server.run(() => {
      //
    });

    await server.stop();
    await server.start();
    
    await server.stop();
    await stopRemoteClient(childClientProcess);
  });

  it("should be able to start again, on client disconnection while running", async () => {
    // Create and start the server
    const server = new Server({
      port: 8090,
      reporter: "base",
      autoRun: false,
    });

    await server.start();

    const clientThatHangsScriptPath = resolve(__dirname, "../fixtures/clientVeryLongRun.js");
    const childClientProcess = await startRemoteClient(clientThatHangsScriptPath, server);

    const results = await Promise.all([runTests(server), stopRemoteClient(childClientProcess)]);
    const failures = results[0];
    expect(failures).to.equal(0);

    const clientScriptPath = resolve(__dirname, "../fixtures/client.js");
    const remoteClientProcess = await startRemoteClient(clientScriptPath, server);

    const result = await runTests(server);
    expect(result).to.equal(1);
    await server.stop();
    await stopRemoteClient(remoteClientProcess);
  });
});
