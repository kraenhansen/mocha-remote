/**
 * Sample React Native App that uses Mocha Remote client
 * https://github.com/facebook/react-native
 * https://github.com/kraenhansen/mocha-remote
 *
 * @format
 * @flow
 */

import React, { Component } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { MochaRemoteClient } from "mocha-remote-client";
import Mocha from "mocha/lib/mocha";

type Props = {};
export default class App extends Component<Props> {
  state = { status: "waiting" };

  componentDidMount() {
    this.prepareTests();
  }

  render() {
    return (
      <View style={styles.container}>
        <Text style={styles.status}>{this.getStatusMessage()}</Text>
        <Text style={styles.details}>{this.getStatusDetails()}</Text>
      </View>
    );
  }

  getStatusMessage() {
    if (this.state.status === "waiting") {
      return "Waiting for server to start tests";
    } else if (this.state.status === "running") {
      return "Running the tests";
    } else if (this.state.status === "ended") {
      return "The tests ended";
    } else {
      return null;
    }
  }

  getStatusDetails() {
    if (this.state.status === "running") {
      const progress = `${this.state.currentTestIndex + 1}/${this.state.totalTests}`;
      return `${progress}: ${this.state.currentTest}`;
    } else {
      return null;
    }
  }

  prepareTests() {
    // 1. Create an instance of Mocha
    const mocha = new Mocha();
    // Set the title of the root suite
    mocha.suite.title = `React-Native on ${Platform.OS}`;

    // 2. Require any tests
    require("./test/simple.test.js");

    // 3. Create a client and instrument the mocha instance
    const client = new MochaRemoteClient();
    client.instrument(mocha, (runner) => {
        runner.on("test", (test) => {
            // Compute the current test index - incrementing it if we're running
            const currentTestIndex =
              this.state.status === "running"
              ? this.state.currentTestIndex + 1
              : 0;
            // Set the state to update the UI
            this.setState({
              status: "running",
              currentTest: test.fullTitle(),
              currentTestIndex,
              totalTests: runner.total,
            });
        });
        runner.on("end", () => {
            this.setState({ status: "ended" });
        });
    });
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  status: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10,
  },
  details: {
    fontSize: 14,
    textAlign: 'center',
    margin: 10,
  },
});
