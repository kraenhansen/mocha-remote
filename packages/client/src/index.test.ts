import { expect } from "chai";
import ws from "ws";

import { MochaRemoteClient } from "./index";

describe("MochaRemoteClient", () => {
  // Tumbleweed
  describe("reconnecting", () => {
    let wss: ws.Server;
    let url: string;

    before(() => {
      wss = new ws.Server({ port: 0 });
      const address = wss.address();
      if (typeof address === "object") {
        url = `ws://localhost:${address.port}`;
      }
    });

    after(() => {
      wss.close();
    });

    it("connects, reconnects and stops when disconnected", async () => {
      const expectedRetries = 3;
      const retryDelay = 50;

      let clientConnections = 0;
      let serverConnections = 0;

      // Count every reconnection attempt
      wss.on("connection", socket => {
        serverConnections++;
        socket.close();
      });

      await new Promise(resolve => {
        const client = new MochaRemoteClient({
          url,
          retryDelay,
          whenConnected: () => {
            clientConnections++;
            if (clientConnections >= expectedRetries) {
              // Disconnecting should prevent any future reconnects
              client.disconnect();
              resolve();
            }
          }
        });
      });

      // Wait for any new reconnects ...
      await new Promise(resolve => setTimeout(resolve, retryDelay * 2));

      expect(clientConnections).equals(serverConnections);
      expect(serverConnections).equals(expectedRetries);
    });
  });
});
