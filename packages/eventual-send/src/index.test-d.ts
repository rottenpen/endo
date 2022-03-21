/* eslint-disable @endo/no-polymorphic-call, import/no-extraneous-dependencies, no-restricted-globals, prettier/prettier */
import { expectType, printType } from 'tsd';
import { E } from '../test/get-hp.js';
import { DataOnly, ERef, FarRef } from './index.js';

// Check the legacy ERef type
const foo = async (a: ERef<{ bar(): string; baz: number }>) => {
  const { baz } = await a;

  expectType<Promise<string>>(E(a).bar());

  // Should be type error, but isn't.
  (await a).bar();

  expectType<Promise<number>>(E.get(a).baz);

  // Should be type error, but isn't.
  expectType<Promise<() => string>>(E.get(a).bar);

  // @ts-expect-error - calling a directly is not typed, but works.
  a.bar();
};

// Remote<T>
const foo2 = async (
  a: FarRef<{ bar(): string }, { far: FarRef<() => 'hello'>; baz: number }>,
) => {
  const { baz, far } = await a;
  expectType<number>(baz);

  expectType<'hello'>(await E(far)());

  expectType<Promise<string>>(E(a).bar());

  // @ts-expect-error - awaiting remotes cannot get functions
  (await a).bar;

  expectType<Promise<number>>(E.get(a).baz);

  // @ts-expect-error - E.get cannot obtain remote functions
  E.get(a).bar;

  expectType<number>((await a).baz);

  // @ts-expect-error - calling directly is valid but not yet in the typedef
  a.bar;
};
