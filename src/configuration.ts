import { ErrorContext } from './error-context';

/**
 * Global configuration passed into epic-supervisor.
 */
export interface IGlobalConfiguration {
  /**
   * Handler method called when any error happens in any epic.
   */
  onAnyError(context: ErrorContext): void;

  /**
   * Handler method called if no onError is given in the supervisor, or
   * if the onError itself throws an error,
   */
  onUnhandledError(context: ErrorContext): void;
}

export const noop = () => {
  /* noop */
};

const current: IGlobalConfiguration = { onAnyError: noop, onUnhandledError: noop };

/**
 * Returns the supervisor's current configuration.
 */
export const getCurrentConfiguration = (): Readonly<IGlobalConfiguration> => current;

/**
 * Updates the supervisor's configuration.
 */
export const configure = (configuration: Partial<IGlobalConfiguration>) => {
  Object.assign(current, configuration);
};
