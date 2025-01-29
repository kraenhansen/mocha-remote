const { Client } = require("mocha-remote-client");

const client = new Client({
    autoConnect: true,
    timeout: 1000000,
    tests: () => {
        it("endless", (done) => {
            setTimeout(() => {
                done();
            }, 1000000);
        });
    }
});
