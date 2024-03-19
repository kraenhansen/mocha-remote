import { StatusBar } from 'expo-status-bar';
import React from "react";
import { StyleSheet, View, SafeAreaView } from 'react-native';

import { MochaRemoteProvider, ConnectionText, StatusEmoji, StatusText } from "mocha-remote-react-native";

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
    textAlign: "center",
  },
  statusText: {
    fontSize: 20,
    margin: 20,
    textAlign: "center",
  },
  connectionText: {
    textAlign: "center",
  },
});
