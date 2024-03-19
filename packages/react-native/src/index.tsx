import React, { useEffect, useState, createContext, useContext } from "react";
import { StyleSheet, Text, View, Platform, TextProps, SafeAreaView } from 'react-native';

import { Client } from "mocha-remote-client";

type Status =
  | {
    kind: "waiting";
  }
  | {
    kind: "running";
    failures: number;
    totalTests: number;
    currentTest: string;
    currentTestIndex: number;
  }
  | {
    kind: "ended";
    failures: number;
    totalTests: number;
  }

type MochaRemoteProviderProps = React.PropsWithChildren<{
  title?: string;
  tests: () => void;
}>;

type MochaRemoteContextValue = {
  connected: boolean;
  status: Status;
};

export const MochaRemoteContext = createContext<MochaRemoteContextValue>({ connected: false, status: { kind: "waiting" } });

export function MochaRemoteProvider({ children, tests, title = `React Native on ${Platform.OS}` }: MochaRemoteProviderProps) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "waiting" });
  useEffect(() => {
    const client = new Client({
      title,
      tests() {
        // Adding an async hook before each test to allow the UI to update
        beforeEach(() => {
          return new Promise<void>((resolve) => setImmediate(resolve));
        });
        // Require in the tests
        tests();
      },
    })
      .on("connection", () => {
        setConnected(true);
      })
      .on("disconnection", ({ reason }) => {
        setConnected(false);
      })
      .on("running", (runner) => {
        // TODO: Fix the types for "runner"
        if (runner.total === 0) {
          setStatus({
            kind: "ended",
            totalTests: 0,
            failures: 0,
          });
        }

        let currentTestIndex = 0;

        runner.on("test", (test) => {
          setStatus({
            kind: "running",
            currentTest: test.fullTitle(),
            // Compute the current test index - incrementing it if we're running
            currentTestIndex: currentTestIndex++,
            totalTests: runner.total,
            failures: runner.failures,
          });
        }).on("end", () => {
          setStatus({
            kind: "ended",
            totalTests: runner.total,
            failures: runner.failures,
          });
        });
      });

    return () => {
      client.disconnect();
    };
  }, [setStatus]);

  return (
    <MochaRemoteContext.Provider value={{status, connected}}>
      {children}
    </MochaRemoteContext.Provider>
  );
}

export function useMochaRemoteContext() {
  return useContext(MochaRemoteContext);
}

function getStatusEmoji(status: Status) {
  if (status.kind === "running") {
    return "🏃";
  } else if (status.kind === "waiting") {
    return "⏳";
  } else if (status.kind === "ended" && status.totalTests === 0) {
    return "🤷";
  } else if (status.kind === "ended" && status.failures > 0) {
    return "❌";
  } else if (status.kind === "ended") {
    return "✅";
  } else {
    return null;
  }
}

export function StatusEmoji(props: TextProps) {
  const {status} = useMochaRemoteContext();
  return <Text {...props}>{getStatusEmoji(status)}</Text>
}

function getStatusMessage(status: Status) {
  if (status.kind === "running") {
    return `[${status.currentTestIndex + 1} of ${status.totalTests}] ${status.currentTest}`;
  } else if (status.kind === "waiting") {
    return "Waiting for server to start tests";
  } else if (status.kind === "ended" && status.failures > 0) {
    return `${status.failures} tests failed!`;
  } else if (status.kind === "ended") {
    return "All tests succeeded!";
  } else {
    return null;
  }
}

export function StatusText(props: TextProps) {
  const {status} = useMochaRemoteContext();
  return <Text {...props}>{getStatusMessage(status)}</Text>
}

function getConnectionMessage(connected: boolean) {
  if (connected) {
    return "🛜 Connected to the Mocha Remote Server";
  } else {
    return "🔌 Disconnected from the Mocha Remote Server";
  }
}

export function ConnectionText(props: TextProps) {
  const {connected} = useMochaRemoteContext();
  return <Text {...props}>{getConnectionMessage(connected)}</Text>
}
