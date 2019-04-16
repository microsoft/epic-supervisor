import { expect } from 'chai';
import { Epic } from 'redux-observable';
import { concat, Observable, of, throwError, timer } from 'rxjs';
import { delay, finalize, switchMap, switchMapTo, tap, toArray } from 'rxjs/operators';
import { stub } from 'sinon';
import { configure } from './configuration';
import { ErrorContext } from './error-context';
import { oneForAll, oneForOne, restForOne } from './managers';
import { combineEpics, superviseEpics } from './supervise-epics';

declare const console: any;

describe('superviseEpics', () => {
  const invokeEpic = (epic: Epic) => {
    const data = (epic as any)() as Observable<string>;
    const emitted: string[] = [];
    return {
      epic: data.pipe(tap(value => emitted.push(value))),
      emitted,
    };
  };

  it('handles errors in a single epic', async () => {
    const expectedErr = new Error();
    const epic1: Epic = () => concat(of('epic1-a'), of('epic1-b').pipe(delay(3)));
    const epic2: Epic = () => timer(1).pipe(switchMapTo(throwError(expectedErr)));

    let didHandleError = false;
    const { epic, emitted } = invokeEpic(
      superviseEpics(
        {
          onError: err => {
            expect(err.epicName).to.equal('epic2');
            expect(err.epicSource).to.include('throwError');
            expect(err.error).to.equal(expectedErr);
            expect(err.innerError).to.be.undefined;
            expect(emitted).to.deep.equal(['epic1-a']);
            didHandleError = true;
          },
        },
        epic1,
        epic2,
      ),
    );

    await epic
      .pipe(toArray())
      .toPromise()
      .then(output => {
        expect(output).to.deep.equal(['epic1-a', 'epic1-b']);
        expect(didHandleError).to.be.true;
      });
  });

  it('calls afterRestart', async () => {
    const epic1: Epic = () =>
      timer(1).pipe(switchMap(() => (restarted ? [] : throwError(new Error()))));

    let handledErrors = 0;
    let restarted = false;
    const { epic } = invokeEpic(
      superviseEpics(
        {
          restart: oneForOne,
          onError: () => {
            handledErrors++;
          },
          onRestart: () => {
            restarted = true;
          },
        },
        epic1,
      ),
    );

    await epic.toPromise().then(() => {
      expect(handledErrors).to.equal(1);
      expect(restarted).to.be.true;
    });
  });

  it('unsubscribes from the source when another epic faults in teardown', async () => {
    let unsubscribed = false;
    const epic1: Epic = () =>
      concat(
        of('epic1-a'),
        of('epic1-b').pipe(
          delay(3),
          finalize(() => (unsubscribed = true)),
        ),
      );
    const epic2: Epic = () => timer(1).pipe(switchMapTo(throwError(new Error())));

    const { epic, emitted } = invokeEpic(
      superviseEpics({ restart: oneForAll, onError: err => throwError(err) }, epic1, epic2),
    );

    await epic
      .pipe(toArray())
      .toPromise()
      .catch(() => {
        expect(emitted).to.deep.equal(['epic1-a']);
        expect(unsubscribed).to.be.true;
      });
  });

  it('bubbles rethrown errors from the error handler', async () => {
    const expectedErr = new Error('oh no!');
    const epic1: Epic = () => throwError(expectedErr);

    const { epic } = invokeEpic(superviseEpics({ onError: err => throwError(err) }, epic1));

    await epic
      .pipe(toArray())
      .toPromise()
      .catch((err: ErrorContext) => {
        expect(err.error).to.equal(expectedErr);
        expect(err.epicName).to.equal('epic1');
      });
  });

  it('catches unexpected errors from the handler', async () => {
    const innerErr = new Error('oh no inner!');
    const outerErr = new Error('oh no outer!');
    const epic1: Epic = () => throwError(innerErr);

    const { epic } = invokeEpic(
      superviseEpics(
        {
          onError: () => {
            throw outerErr;
          },
        },
        epic1,
      ),
    );

    await epic
      .pipe(toArray())
      .toPromise()
      .catch((err: ErrorContext) => {
        expect(err.error).to.equal(outerErr);
        expect(err.innerError!.error).to.equal(innerErr);
      });
  });

  it('has a sensible default error handler', () => {
    const logStub = stub(console, 'error');
    const expectedErr = new Error('oh no!');
    const onUnhandledError = stub();
    const epic1 = () => throwError(expectedErr);
    const { epic } = invokeEpic(combineEpics(epic1));
    configure({ onUnhandledError });

    epic.subscribe();

    expect(logStub.args[0]).to.deep.equal([
      `An uncaught error occurred in epic "epic1"`,
      expectedErr,
    ]);
    expect(onUnhandledError.args).to.deep.equal([[new ErrorContext(epic1, expectedErr)]]);

    logStub.restore();
  });

  it('calls onAnyError successfully', done => {
    const onAnyError = stub();
    const onUnhandledError = stub();
    const err1 = new Error('oh no1');
    const err2 = new Error('oh no2');
    const epic = () => throwError(err1);
    const err1Context = new ErrorContext(epic, err1);
    configure({ onAnyError, onUnhandledError });

    invokeEpic(superviseEpics({ onError: () => undefined }, epic)).epic.subscribe({
      complete: () => {
        expect(onAnyError.args[0]).to.deep.equal([err1Context]);

        onAnyError.reset();

        const rethrower = () => {
          throw err2;
        };

        invokeEpic(superviseEpics({ onError: rethrower }, epic)).epic.subscribe({
          error: () => {
            expect(onAnyError.args).to.deep.equal([
              [err1Context],
              [new ErrorContext(rethrower, err2, err1Context)],
            ]);
            expect(onUnhandledError.args).to.deep.equal([
              [new ErrorContext(rethrower, err2, err1Context)],
            ]);
            done();
          },
        });
      },
    });
  });

  const tcases = [
    {
      name: 'oneForOne restart',
      expected: ['epic1-a', 'epic3-a', /* restart epic2 */ 'epic1-b', 'epic2-a'],
      method: oneForOne,
    },
    {
      name: 'oneForAll restart',
      expected: [
        'epic1-a',
        'epic3-a',
        /* restart all */
        'epic1-a',
        'epic3-a',
        'epic2-a',
        'epic1-b',
      ],
      method: oneForAll,
    },
    {
      name: 'restForOne restart',
      expected: ['epic1-a', 'epic3-a', /* restart epic2+3 */ 'epic1-b', 'epic3-a', 'epic2-a'],
      method: restForOne,
    },
  ];

  for (const tcase of tcases) {
    it(tcase.name, async () => {
      let handledErrors = 0;
      const expectedErr = new Error();
      const epic1: Epic = () => concat(of('epic1-a'), of('epic1-b').pipe(delay(3)));
      const epic2: Epic = () =>
        timer(1).pipe(switchMapTo(handledErrors ? of('epic2-a') : throwError(expectedErr)));
      const epic3: Epic = () => of('epic3-a');

      const { epic } = invokeEpic(
        superviseEpics(
          {
            restart: tcase.method,
            onError: () => {
              handledErrors++;
              return timer(5);
            },
          },
          epic1,
          epic2,
          epic3,
        ),
      );

      await epic
        .pipe(toArray())
        .toPromise()
        .then(output => {
          expect(handledErrors).to.equal(1);
          expect(output).to.deep.equal(tcase.expected);
        });
    });
  }
});
