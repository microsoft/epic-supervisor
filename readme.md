# @mixer/epic-supervisor

> Project status: this repo is actively maintained and currently used in production code.

[redux-observable](https://github.com/redux-observable/redux-observable) is an RxJS-based side effects module for Redux. Unfortunately, it lacks a built-in way to handle uncaught errors, which by default are unlogged and break all epics in the application. The maintainers [have indicated](https://github.com/redux-observable/redux-observable/issues/94#issuecomment-454968018) that there's no immediate plans to implement a 'first-party' solution for error handling. So, this is ours! This module implements an [Erlang/OTP-style supervisor](http://erlang.org/doc/design_principles/sup_princ.html) pattern for epics. Out of the box it provides a `combineEpics`-compatible function which instruments epics with error logging, and provides an additional `superviseEpics` method which provides additional supervision options for epics.

```ts
// 1. import from this module, instead of redux-observable:
import { combineEpics } from '@mixer/epic-supervisor';

// 2. Define your epics...
const fooEpic = /* ... */;
const barEpic = /* ... */;

// 3. combineEpics() like you normall would:
export const myEpics = combineEpics(fooEpic, barEpic);
```

# API

## `combineEpics(...epics)`

By default, this method functions identically to [`combineEpics`](https://redux-observable.js.org/docs/api/combineEpics.html) from `redux-observable`.

## `superviseEpics(options, ...epics)`

This works like `combineEpics`, except with an options argument in front. The options object can take several parameters, all optional:

- **restart**: defines how epics should be restarted if they error. May be one of `noRestarts`, `oneForOne`, `oneForAll`, or `restForOne`. See the [erlang supervisor page](http://erlang.org/doc/design_principles/sup_princ.html#restart-strategy) for nice diagrams of these. Defaults to `noRestarts`, indicating restarts will not occur.
- **onError**: a function with the same mechanism as RxJS `catchError()`-- it will be invoked with the error context object (see beow) that occurs, followed by the actions, state, and services just like a normal epic. If restart is enabled we'll wait for the returned observable to emit before restarting epics. If an error is thrown or rethrown from this method, it will bubble up to any parent supervisor.
- **onRestart**: a function invoked after epics are restarted. Same call signature as `onError`.

Example:

```ts
import { superviseEpics, oneForOne } from '@mixer/epic-supervisor';
import { timer } from 'rxjs';

const fooEpic = /* ... */;
const barEpic = /* ... */;

const options = {
  restart: oneForOne,
  onError: ({ epicName, error }, actions, state, services) => {
    // Send another action when the error occurs:
    actions.dispatch(doLogErrorAction({ message: `An error occurred in epic ${epicName}`, error }));
    // Wait a second before restarting epics:
    return timer(1000);
  },
  onRestart (_, actions) => {
    actions.dispatch(restartMyService());
  },
};

superviseEpics(options, fooEpic, barEpic);
```

## `configure(options)`

Configures the global/default options for epic-supervisor. The options object can take several parameters, all optional:

- **onAnyError**: A method invoked with any error that gets observed. The first any only argument is the ErrorContext object.
- **onUnhandledError**: A method invoked with any error not handled by (or thrown-from) the user-supplied `onError` method.

```ts
import { configure } from '@mixer/epic-supervisor';

configure({
  onAnyError: context => myLogger.warn(context),
  onUnhandledError: context => myLogger.error(context),
});
```

## Error Context Object

The error context (`IErrorContext` for TypeScript consumers) captures thrown errors along with some metadata--as rxjs stacktraces are often inscrutable. It has the following properties:

- **error**: the original error that was thrown;
- **epicName**: the function name of the epic that the error came from. This may be `null` for epics that lack a function name.
- **epicSource**: the epic source string; useful for tracking down errors from unnamed or minified epics.
- **innerError**: can be set if an error happened whilst handling a previous error. The 'outer' error will be second error, while the innerError will be the original one.
- **innermostError**: gets the deepest `innerError`, the original error that occurred. Returns the current error context if there is no innerError.
