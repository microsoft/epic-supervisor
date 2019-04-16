import { Subscriber, Subscription } from 'rxjs';
import { IEpicManager, IFactoryOptions } from '.';
import { getFunctionName } from '../error-context';

const enum State {
  Active,
  Faulted,
}

/**
 * Implementation of the IEpicManager.
 */
export class EpicManager implements IEpicManager {
  private subscriptions: Array<{ state: State; subscription: Subscription }> = [];

  constructor(
    private readonly getFaultedChain: (original: number) => number[],
    private readonly doesRestart: boolean,
    private readonly options: IFactoryOptions,
  ) {}

  public connect() {
    for (let i = 0; i < this.options.epics.length; i++) {
      this.createSubscription(i);
    }
  }

  public error(err: Error): void {
    this.options.subscriber.error(err);
    this.close();
  }

  public close(): void {
    for (const { subscription } of this.subscriptions) {
      subscription.unsubscribe();
    }
  }

  public fault(index: number): void {
    for (const i of this.getFaultedChain(index)) {
      const sub = this.subscriptions[i];
      if (sub.state === State.Active && !sub.subscription.closed) {
        sub.state = State.Faulted;
        sub.subscription.unsubscribe();
      }
    }
  }

  public restart(index: number): void {
    for (const i of this.getFaultedChain(index)) {
      const sub = this.subscriptions[i];
      sub.state = State.Active;
      if (this.doesRestart) {
        this.createSubscription(i);
      } else {
        sub.subscription.unsubscribe();
      }
    }

    if (!this.doesRestart) {
      this.checkForCompletion();
    }
  }

  private createSubscription(index: number) {
    const epic = this.options.epics[index];
    const observable = epic(this.options.actions, this.options.state, this.options.services);
    if (!observable) {
      const name = getFunctionName(epic);
      throw new TypeError(
        `combineEpics: one of the provided Epics "${name}" does not return a stream. Double check you\'re not missing a return statement!`,
      );
    }

    const subscriber = new Subscriber(
      value => {
        this.options.subscriber.next(value);
      },
      err => {
        this.options.onError(err, index);
      },
      () => {
        subscriber.unsubscribe();

        // If we haven't finished adding subscriptions, this is a synchronous
        // completion. We don't need to do anything... yet.
        if (this.subscriptions.length === this.options.epics.length) {
          this.checkForCompletion();
        }
      },
    );

    this.subscriptions[index] = { state: State.Active, subscription: subscriber };
    observable.subscribe(subscriber);
  }

  private checkForCompletion() {
    for (const sub of this.subscriptions) {
      if (sub.state === State.Faulted || !sub.subscription.closed) {
        return;
      }
    }

    this.options.subscriber.complete();
  }
}
