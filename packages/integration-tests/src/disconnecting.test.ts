import { expect } from "chai";

import { Server } from "mocha-remote-server";

import { ChildProcess, fork } from "child_process";
import { resolve } from "path";

describe("disconnecting a client", () => {
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
    it("should be able to start again, when the server is stopped during a run", async function() {
        this.timeout(10000);
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

    it("should be able to start again, on client disconnection while running", async function() {
        this.timeout(10000);
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