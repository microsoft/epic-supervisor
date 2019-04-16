import { expect } from 'chai';
import { Action } from 'redux';
import { ActionsObservable, Epic, ofType } from 'redux-observable';
import { of, Subject } from 'rxjs';
import { map, toArray } from 'rxjs/operators';
import { stub } from 'sinon';
import { combineEpics } from './supervise-epics';

/**
 * These tests are copied from redux-observable and used to ensure
 * compatibility between our guarded version of combineEpics and the official
 * version.
 *
 * @license
 * The MIT License (MIT)
 *
 * Copyright (c) 2016-2018 Ben Lesh, Jay Phelps, and redux-observable contributors.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

describe('combineEpics', () => {
  it('should combine epics', () => {
    const epic1: Epic = (innerActions, innerStore) =>
      innerActions.pipe(
        ofType('ACTION1'),
        map(action => ({ type: 'DELEGATED1', action, store: innerStore })),
      );
    const epic2: Epic = (innerActions, innerStore) =>
      innerActions.pipe(
        ofType('ACTION2'),
        map(action => ({ type: 'DELEGATED2', action, store: innerStore })),
      );

    const epic = combineEpics(epic1, epic2);

    const store: any = { I: 'am', a: 'store' };
    const subject = new Subject<Action>();
    const actions = new ActionsObservable(subject);
    const result = epic(actions, store, {});
    const emittedActions: Action[] = [];

    result.subscribe((emittedAction: Action) => emittedActions.push(emittedAction));

    subject.next({ type: 'ACTION1' });
    subject.next({ type: 'ACTION2' });

    expect(emittedActions).to.deep.equal([
      { type: 'DELEGATED1', action: { type: 'ACTION1' }, store },
      { type: 'DELEGATED2', action: { type: 'ACTION2' }, store },
    ]);
  });

  it('should pass along every argument arbitrarily', done => {
    const epic1 = stub().returns(of('first'));
    const epic2 = stub().returns(of('second'));

    const rootEpic: any = combineEpics(epic1, epic2);

    rootEpic(1, 2, 3)
      .pipe(toArray())
      .subscribe((values: string[]) => {
        expect(values).to.deep.equal(['first', 'second']);

        expect(epic1.callCount).to.equal(1);
        expect(epic2.callCount).to.equal(1);

        expect(epic1.firstCall.args).to.deep.equal([1, 2, 3]);
        expect(epic2.firstCall.args).to.deep.equal([1, 2, 3]);

        done();
      });
  });

  it("should return a new epic that, when called, errors if one of the combined epics doesn't return anything", done => {
    const epic1 = stub().returns(of('first'));
    const epic2 = stub().returns(null);

    const rootEpic = combineEpics(epic1, epic2);

    rootEpic(1, 2, 3)
      .pipe(toArray())
      .subscribe({
        error: (err: Error) => {
          expect(err).to.be.an.instanceOf(TypeError);
          expect(err.message).to.contain("Double check you're not missing a return statement!");
          done();
        },
      });
  });

  describe('returned epic function name', () => {
    const epic1: any = () => of('named epic');
    const epic2: any = () => of('named epic');
    const epic3: any = () => of('named epic');

    it('should name the new epic with `combineEpics(...epic names)`', () => {
      const rootEpic = combineEpics(epic1, epic2);

      expect(rootEpic)
        .to.have.property('name')
        .that.equals('superviseEpics(epic1, epic2)');
    });

    it('should annotate combined anonymous epics with `<anonymous>`', () => {
      const rootEpic = combineEpics(() => 'anonymous' as any, epic2);

      expect(rootEpic)
        .to.have.property('name')
        .that.equals('superviseEpics(<anonymous>, epic2)');
    });

    it('should include all combined epic names in the returned epic', () => {
      const rootEpic = combineEpics(epic1, epic2, epic3);

      expect(rootEpic)
        .to.have.property('name')
        .that.equals('superviseEpics(epic1, epic2, epic3)');
    });
  });
});
