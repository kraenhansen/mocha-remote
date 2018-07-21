# Mocha Remote ☕️

Run your tests somewhere and get reporting elsewhere.

## Why?

This package was created when I wanted to run a single Mocha test suite across multiple environments
(Node.js, Electron and React-Native) with ideally no changes to the test suite. When the Mocha tests are running inside
the remote Electron on React-Native process - how do you control it and how do you get reporting on which tests pass or
fail? My answer was `mocha-remote`.

## Install

Install the client in the package that will be running tests.
This will probably be an example app in a particular environment from which you want to run your tests.

```
npm install moche-remote-client --save
```

Install the server in the package from where you want to

```
npm install moche-remote-server --save-dev
```
