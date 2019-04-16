import { Action } from 'redux';
import { ActionsObservable, Epic, StateObservable } from 'redux-observable';
import { Subscriber } from 'rxjs';
import { EpicManager } from './epic-manager';

export interface IEpicManager {
  /**
   * Boots the manager.
   */
  connect(): void;

  /**
   * Emits the given error to the output stream.
   */
  error(err: Error): void;

  /**
   * Unsubscribes from all source epics.
   */
  close(): void;

  /**
   * Indicates a fault happened on the given epic index. Should disconnect it.
   */
  fault(index: number): void;

  /**
   * Restarts a previously faulted epic.
   */
  restart(index: number): void;
}

/**
 * Options passed to IEpicFactory instance.
 */
export interface IFactoryOptions<
  Input extends Action = any,
  Output extends Input = Input,
  State = any,
  Dependencies = any
> {
  subscriber: Subscriber<Output>;
  epics: ReadonlyArray<Epic<Input, Output, State, Dependencies>>;
  onError: (error: Error, index: number) => void;
  actions: ActionsObservable<Output>;
  state: StateObservable<State>;
  services: Dependencies;
}

/**
 * Type that creates an epic manager.
 */
export type IEpicFactory = (options: IFactoryOptions) => IEpicManager;

/**
 * Restart policy that does not restart any epics.
 */
export const noRestarts: IEpicFactory = options =>
  new EpicManager(original => [original], false, options);

/**
 * Restart policy that restarts a single epic if it fails.
 */
export const oneForOne: IEpicFactory = options =>
  new EpicManager(original => [original], true, options);

/**
 * Generates the range of integers in [start, end).
 */
const range = (start: number, end: number): number[] => {
  const out = [];
  while (start < end) {
    out.push(start++);
  }
  return out;
};

/**
 * Restart policy that restarts all epics if one fails.
 */
export const oneForAll: IEpicFactory = options =>
  new EpicManager(() => range(0, options.epics.length), true, options);

/**
 * Restart policy that restarts all subsequent epics if one fails.
 */
export const restForOne: IEpicFactory = options =>
  new EpicManager(original => range(original, options.epics.length), true, options);
