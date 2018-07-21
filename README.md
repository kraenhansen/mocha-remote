<p align="center">
  <img src="https://github.com/kraenhansen/mocha-remote/raw/master/docs/logo.svg?sanitize=true" alt="Mocha Remote"/>
</p>

<p align="center">
  ☕️🕹 Run Mocha tests somewhere - get reporting elsewhere 🕹☕️
</p>

## Why?

I wanted to run a single Mocha test suite across multiple environments (Node.js, Electron and React-Native) with ideally
no changes to the test suite. I found that running the Mocha tests inside the Electron on React-Native apps, it was
difficult to control it, start / stop external services and get reporting on which tests pass or fail.

## Installing the client

Install the client in the package that will be running tests.
This will probably be an example app in a particular environment from which you want to run your tests.

```
npm install moche-remote-client --save
```

## Installing the server

Install the server in the package from where you want reporting

```
npm install moche-remote-server --save-dev
```

Note: This could easily be wrapped into a mocha compatible cli.

---

**Attributions for the logo:**

- Original Mocha logo by Dick DeLeon <ddeleon@decipherinc.com> and Christopher Hiller <boneskull@boneskull.com>.
- [Hand pointing](https://thenounproject.com/search/?q=pointing%20hand&i=593527) by creative outlet from the Noun Project.
- [Wireless](https://thenounproject.com/search/?q=wireless&i=21574) by Piotrek Chuchla from the Noun Project
