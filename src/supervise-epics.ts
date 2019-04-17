import { Action } from 'redux';
import { ActionsObservable, Epic, StateObservable } from 'redux-observable';
import { Observable, of, Subscriber, throwError } from 'rxjs';
import { catchError, take } from 'rxjs/operators';
import { getCurrentConfiguration, noop } from './configuration';
import { ErrorContext, getFunctionName } from './error-context';
import { IEpicFactory, noRestarts } from './managers';

/**
 * Function type that handles errors in the ISupervisionOptions. Invoked
 * with the error that occurred and an error output stream. If an observable
 * is returned, we'll wait for that before restarting epics, if appropriate.
 */
export type ErrorHandler<Output extends Action, State, Services> = (
  error: ErrorContext,
  actions: ActionsObservable<Output>,
  state: StateObservable<State>,
  services: Services,
) => Observable<any> | void;

/**
 * Options passed to `superviseEpics`.
 */
export interface ISupervisionOptions<Output extends Action, State, Services> {
  restart: IEpicFactory;
  onError: ErrorHandler<Output, State, Services>;
  onRestart: ErrorHandler<Output, State, Services>;
}

declare const console: { error: (...args: any[]) => void };

/**
 * Default error handler if the user does not provide an override.
 */
const defaultErrorHandler = (err: ErrorContext) => {
  // tslint:disable-next-line
  console.error(`An uncaught error occurred in epic "${err.epicName}"`, err.error);
  getCurrentConfiguration().onUnhandledError(err);
};

/**
 * Error handler helper. Tries to call the error handler function, wrapping
 * the inner error as appropriate.
 */
const handleError = <Output extends Action, State, Services>(
  err: ErrorContext,
  handler: ErrorHandler<Output, State, Services>,
  actions: ActionsObservable<Output>,
  state: StateObservable<State>,
  services: Services,
) => {
  const config = getCurrentConfiguration();
  config.onAnyError(err);

  let restartSignal: Observable<any>;
  try {
    restartSignal = handler(err, actions, state, services) || of(undefined);
  } catch (outerError) {
    restartSignal = throwError(outerError);
  }

  return restartSignal.pipe(
    catchError(outerErr => {
      const wrapped =
        outerErr instanceof ErrorContext ? outerErr : new ErrorContext(handler, outerErr, err);
      config.onAnyError(wrapped);
      config.onUnhandledError(wrapped);
      return throwError(wrapped);
    }),
  );
};

/**
 * A combineEpics-esque function which supports configurably restarting
 * on errors. See the @mixer/epic-supervisor readme for more documentation.
 */
export const superviseEpics = <
  Input extends Action = any,
  Output extends Input = Input,
  State = any,
  Dependencies = any
>(
  {
    restart = noRestarts,
    onError = defaultErrorHandler,
    onRestart = noop,
  }: Partial<ISupervisionOptions<Input, State, Dependencies>>,
  ...epics: Array<Epic<Input, Output, State, Dependencies>>
): Epic<Input, Output, State, Dependencies> => {
  const mergedEpic: Epic<Input, Output, State, Dependencies> = (actions, state, services) =>
    new Observable((subscriber: Subscriber<Output>) => {
      const restarter = restart({
        subscriber,
        epics,
        actions,
        state,
        services,
        onError: (error, index) => {
          restarter.fault(index);

          const context = new ErrorContext(epics[index], error);
          handleError(context, onError, actions, state, services)
            .pipe(take(1))
            .subscribe(
              () => {
                restarter.restart(index);
                onRestart(context, actions, state, services);
              },
              err => {
                restarter.error(err);
              },
            );
        },
      });

      restarter.connect();
      return () => {
        restarter.close();
      };
    });

  // Technically the `name` property on Function's are supposed to be read-only.
  // While some JS runtimes allow it anyway (so this is useful in debugging)
  // some actually throw an exception when you attempt to do so.
  try {
    Object.defineProperty(mergedEpic, 'name', {
      value: `superviseEpics(${epics.map(getFunctionName).join(', ')})`,
    });
  } catch (e) {
    // ignored
  }

  return mergedEpic;
};

/**
 * A combineEpics-compatible function.
 */
export const combineEpics = <T extends Epic>(...epics: ReadonlyArray<T>): T =>
  superviseEpics({}, ...epics) as T;
