import { Client } from "mocha-remote-client"

const wait = parseInt(process.argv.pop() || "0", 10);

new Client({
    autoConnect: true,
    tests: () => {
        it("should reject", (done) => {
            setTimeout(done, wait);
        });
    }
});
