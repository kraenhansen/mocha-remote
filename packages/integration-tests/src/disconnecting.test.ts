import cp from "child_process";
import { expect } from "chai";
import { resolve } from "path";

import { Server } from "mocha-remote-server";

const TEST_CLIENT_PATH = resolve(__dirname, "../fixtures/client.ts");

/**
 * @returns a promise of a child process for a client resolving when the client connects to the server.
 */
function startClient(server: Server, timeout: number) {
    const clientProcess = cp.spawn(
        process.execPath,
        ["--import", "tsx", TEST_CLIENT_PATH, timeout.toString()],
        { stdio: "inherit", env: { ...process.env, FORCE_COLOR: "false" }, timeout: 5_000 },
    );
    return new Promise<cp.ChildProcess>((resolve) => {
        server.once("connection", () => resolve(clientProcess));
    });
}

/**
 * Stop a client previously started with {@link startClient}.
 * @returns a promise of the client process exiting.
 */
function stopClient(clientProcess: cp.ChildProcess) {
    const result = new Promise((resolve) => clientProcess.once("exit", resolve));
    clientProcess.kill();
    return result;
}

describe("disconnecting a client", () => {
    it("should be able to start again, when the server is stopped during a run", async function() {
        this.timeout(10000);
        // Create and start the server
        const server = new Server({
            port: 8090,
            reporter: "base",
            autoRun: false,
        });

        await server.start();
        const running = new Promise<unknown>(resolve => server.once("running", resolve));

        // Start a client waiting longer then the test timeout
        const childClientProcess = await startClient(server, this.timeout());

        // Starting a run, which will be stopped before it completes naturally
        let completed = false;
        server.run(() => {
            completed = true;
        });
        
        // Wait for the tests to start running
        await running;

        // Stop and restart the server
        await server.stop();
        await server.start();

        // Finally stop the server and client
        await server.stop();
        await stopClient(childClientProcess);

        // Stopping the server will call the callback passed to run
        expect(completed).to.equal(false);
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
        {
            // Start a client waiting longer then the test timeout
            const childClientProcess = await startClient(server, this.timeout() * 2);

            // Abort the run by disconnecting the client
            let completed = false;
            server.run(() => {
                completed = true
            });
            // Wait for the server to start running
            await new Promise(resolve => server.once("running", resolve));
            // Disconnect the client while running
            await stopClient(childClientProcess);
            // Expect no completion
            expect(completed).to.equal(false);
        }

        {
            // Connect with a new client
            // Start a client completing fast
            const childClientProcess = await startClient(server, 0);

            // Run the tests again to completion
            const result = await new Promise<number>((resolve) => server.run(resolve));
            expect(result).to.equal(0);

            // Stop the server and the client
            await stopClient(childClientProcess);
        }
        
        await server.stop();
    });
});