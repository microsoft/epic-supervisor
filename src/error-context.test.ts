import { expect } from 'chai';
import { ErrorContext } from './error-context';

describe('ErrorContext', () => {
  it('captures data successfully', () => {
    const fn = () => 'hello world';
    const error = new ErrorContext(fn, new Error('oh no!'));

    expect(error.epicName).to.equal('fn');
    expect(error.epicSource).to.contain('hello world');
    expect(error.innerError).to.be.undefined;
    expect(error.innermostError).to.equal(error);
    expect(error.stack).to.equal(error.error.stack);
  });

  it('nests errors', () => {
    const fn = () => 'hello world';
    const a = new ErrorContext(fn, new Error('oh no!'));
    const b = new ErrorContext(fn, new Error('oh no again!'), a);
    const c = new ErrorContext(fn, new Error('oh no once more!'), b);

    expect(c.innermostError).to.equal(a);
    expect(c.innerError).to.equal(b);

    expect(b.innermostError).to.equal(a);
    expect(b.innerError).to.equal(a);
  });
});
