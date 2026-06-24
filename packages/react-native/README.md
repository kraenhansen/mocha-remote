<p align="center">
  <img src="https://github.com/kraenhansen/mocha-remote/raw/main/docs/logo.svg?sanitize=true" alt="Mocha Remote"/>
</p>

<p align="center">
  ☕️🕹 Run Mocha tests in a React Native app - get reporting in your terminal 🕹☕️
</p>

## Mocha Remote

See [mocha-remote](https://www.npmjs.com/package/mocha-remote) for general information about Mocha Remote.

## Mocha Remote for React Native

A wrapper around the `mocha-remote-client` to provide a UI for running tests in a React Native app.

See this Expo app as an example of usage: https://github.com/kraenhansen/mocha-remote/tree/main/examples/expo

```tsx
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, View, SafeAreaView } from 'react-native';

import {
  MochaRemoteProvider,
  ConnectionText,
  StatusEmoji,
  StatusText,
} from 'mocha-remote-react-native';

function loadTests() {
  require('./simple.test.js');
}

export default function App() {
  return (
    <MochaRemoteProvider tests={loadTests}>
      <StatusBar hidden />
      <SafeAreaView style={styles.container}>
        <ConnectionText style={styles.connectionText} />
        <View style={styles.statusContainer}>
          <StatusEmoji style={styles.statusEmoji} />
          <StatusText style={styles.statusText} />
        </View>
      </SafeAreaView>
    </MochaRemoteProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  statusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusEmoji: {
    fontSize: 30,
    margin: 30,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 20,
    margin: 20,
    textAlign: 'center',
  },
  connectionText: {
    textAlign: 'center',
  },
});
```
