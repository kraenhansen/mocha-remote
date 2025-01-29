const { Client } = require("mocha-remote-client");

const client = new Client({
    autoConnect: true,
    tests: () => {
        it("should reject", (done) => {
            done(new Error("This should not happen"));
        });
    }
});
