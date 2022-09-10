// @ts-check

import { test } from './prepare-test-env-ava.js';

import { passStyleOf } from '../src/passStyleOf.js';

import { makeMarshal } from '../src/marshal.js';
import { makeTagged } from '../src/makeTagged.js';

const { freeze, isFrozen, create, prototype: objectPrototype } = Object;

// this only includes the tests that do not use liveSlots

/**
 * A list of `[plain, encoding]` pairs, where plain serializes to the
 * stringification of `encoding`, which unserializes to something deepEqual
 * to `plain`.
 */
export const roundTripPairs = harden([
  // Simple JSON data encodes as itself
  [
    [1, 2],
    [1, 2],
  ],
  [{ foo: 1 }, { foo: 1 }],
  [{}, {}],
  [
    { a: 1, b: 2 },
    { a: 1, b: 2 },
  ],
  [
    { a: 1, b: { c: 3 } },
    { a: 1, b: { c: 3 } },
  ],
  [true, true],
  [1, 1],
  ['abc', 'abc'],
  [null, null],

  // escapes
  ["'abc'", "''abc'"],
  ['"abc"', '"abc"'],
  ['$abc"', '\'$abc"'],
  ['@abc"', '@abc"'],
  ['-abc', "'-abc"],
  ['+abc', "'+abc"],
  ['-6456', "'-6456"],
  ['+45645', "'+45645"],

  // TODO test slots and sltos w/o iface
  // TODO use $ for symbol and @ for slots?

  // Scalars not represented in JSON
  [undefined, '#undefined'],
  [NaN, '#NaN'],
  [Infinity, '#Infinity'],
  [-Infinity, '#-Infinity'],
  [4n, '+4'],
  [-4n, '-4'],
  [0n, '+0'],
  // Does not fit into a number
  [9007199254740993n, '+9007199254740993'],
  [-9007199254740993n, '-9007199254740993'],

  // Well known symbols
  [Symbol.asyncIterator, { '@qclass': 'symbol', name: '@@asyncIterator' }],
  [Symbol.match, { '@qclass': 'symbol', name: '@@match' }],
  // Registered symbols
  [Symbol.for('foo'), { '@qclass': 'symbol', name: 'foo' }],
  // Registered symbol hilbert hotel
  [Symbol.for('@@foo'), { '@qclass': 'symbol', name: '@@@@foo' }],

  // Normal json reviver cannot make properties with undefined values
  [[undefined], ['#undefined']],
  [{ foo: undefined }, { foo: '#undefined' }],

  // tagged
  [
    makeTagged('x', 8),
    {
      '@qclass': 'tagged',
      tag: 'x',
      payload: 8,
    },
  ],
  [
    makeTagged('x', undefined),
    {
      '@qclass': 'tagged',
      tag: 'x',
      payload: '#undefined',
    },
  ],

  // errors
  [
    Error(),
    {
      '@qclass': 'error',
      message: '',
      name: 'Error',
    },
  ],
  [
    ReferenceError('msg'),
    {
      '@qclass': 'error',
      message: 'msg',
      name: 'ReferenceError',
    },
  ],

  // Hilbert hotel
  [
    { '@qclass': 8 },
    {
      '@qclass': 'hilbert',
      original: 8,
    },
  ],
  [
    { '@qclass': '@qclass' },
    {
      '@qclass': 'hilbert',
      original: '@qclass',
    },
  ],
  [
    { '@qclass': { '@qclass': 8 } },
    {
      '@qclass': 'hilbert',
      original: {
        '@qclass': 'hilbert',
        original: 8,
      },
    },
  ],
  [
    {
      '@qclass': {
        '@qclass': 8,
        foo: 'foo1',
      },
      bar: { '@qclass': undefined },
    },
    {
      '@qclass': 'hilbert',
      original: {
        '@qclass': 'hilbert',
        original: 8,
        rest: { foo: 'foo1' },
      },
      rest: {
        bar: {
          '@qclass': 'hilbert',
          original: '#undefined',
        },
      },
    },
  ],
]);

test('serialize unserialize round trip pairs', t => {
  const { serialize, unserialize } = makeMarshal(undefined, undefined, {
    // TODO errorTagging will only be recognized once we merge with PR #2437
    // We're turning it off only for the round trip test, not in general.
    errorTagging: 'off',
  });
  for (const [plain, encoded] of roundTripPairs) {
    const { body } = serialize(plain);
    const encoding = JSON.stringify(encoded);
    t.is(body, encoding);
    const decoding = unserialize({ body, slots: [] });
    t.deepEqual(decoding, plain);
    t.assert(isFrozen(decoding));
  }
});

test('serialize static data', t => {
  const m = makeMarshal();
  const ser = val => m.serialize(val);
  t.throws(() => ser([1, 2]), {
    message: /Cannot pass non-frozen objects like/,
  });
  // -0 serialized as 0
  t.deepEqual(ser(0), { body: '0', slots: [] });
  t.deepEqual(ser(-0), { body: '0', slots: [] });
  t.deepEqual(ser(-0), ser(0));
  // unregistered symbols
  t.throws(() => ser(Symbol('sym2')), {
    // An anonymous symbol is not Passable
    message: /Only registered symbols or well-known symbols are passable:/,
  });

  const cd = ser(harden([1, 2]));
  t.is(isFrozen(cd), true);
  t.is(isFrozen(cd.slots), true);
});

test('unserialize static data', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] });

  // should be frozen
  const arr = uns('[1,2]');
  t.truthy(isFrozen(arr));
  const a = uns('{"b":{"c":{"d": []}}}');
  t.truthy(isFrozen(a));
  t.truthy(isFrozen(a.b));
  t.truthy(isFrozen(a.b.c));
  t.truthy(isFrozen(a.b.c.d));
});

test('serialize errors', t => {
  const m = makeMarshal();
  const ser = val => m.serialize(val);

  t.deepEqual(ser(harden(Error())), {
    body:
      '{"@qclass":"error","errorId":"error:anon-marshal#10001","message":"","name":"Error"}',
    slots: [],
  });

  t.deepEqual(ser(harden(ReferenceError('msg'))), {
    body:
      '{"@qclass":"error","errorId":"error:anon-marshal#10002","message":"msg","name":"ReferenceError"}',
    slots: [],
  });

  // TODO Once https://github.com/Agoric/SES-shim/issues/579 is merged
  // do a golden of the error notes generated by the following

  // Extra properties
  const errExtra = Error('has extra properties');
  // @ts-ignore Check dynamic consequences of type violation
  errExtra.foo = [];
  freeze(errExtra);
  t.assert(isFrozen(errExtra));
  // @ts-ignore Check dynamic consequences of type violation
  t.falsy(isFrozen(errExtra.foo));
  t.deepEqual(ser(errExtra), {
    body:
      '{"@qclass":"error","errorId":"error:anon-marshal#10003","message":"has extra properties","name":"Error"}',
    slots: [],
  });
  // @ts-ignore Check dynamic consequences of type violation
  t.falsy(isFrozen(errExtra.foo));

  // Bad prototype and bad "message" property
  const nonErrorProto1 = { __proto__: Error.prototype, name: 'included' };
  const nonError1 = { __proto__: nonErrorProto1, message: [] };
  t.deepEqual(ser(harden(nonError1)), {
    body:
      '{"@qclass":"error","errorId":"error:anon-marshal#10004","message":"","name":"included"}',
    slots: [],
  });
});

test('unserialize errors', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] });

  const em1 = uns(
    '{"@qclass":"error","message":"msg","name":"ReferenceError"}',
  );
  t.truthy(em1 instanceof ReferenceError);
  t.is(em1.message, 'msg');
  t.truthy(isFrozen(em1));

  const em2 = uns('{"@qclass":"error","message":"msg2","name":"TypeError"}');
  t.truthy(em2 instanceof TypeError);
  t.is(em2.message, 'msg2');

  const em3 = uns('{"@qclass":"error","message":"msg3","name":"Unknown"}');
  t.truthy(em3 instanceof Error);
  t.is(em3.message, 'msg3');
});

test('passStyleOf null is "null"', t => {
  t.assert(passStyleOf(null), 'null');
});

test('mal-formed @qclass', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] });
  t.throws(() => uns('{"@qclass": 0}'), { message: /invalid qclass/ });
});

test('records', t => {
  function convertValToSlot(_val) {
    return 'slot';
  }
  const fauxPresence = harden({});
  function convertSlotToVal(_slot) {
    return fauxPresence;
  }
  const { serialize: ser, unserialize: unser } = makeMarshal(
    convertValToSlot,
    convertSlotToVal,
  );

  const emptyData = { body: JSON.stringify({}), slots: [] };

  function build(...opts) {
    const props = {};
    for (const opt of opts) {
      if (opt === 'enumStringData') {
        props.key1 = { enumerable: true, value: 'data' };
      } else if (opt === 'enumStringGetData') {
        props.enumStringGetData = { enumerable: true, get: () => 0 };
      } else if (opt === 'enumStringGetFunc') {
        props.enumStringGetFunc = { enumerable: true, get: () => () => 0 };
      } else if (opt === 'enumStringSet') {
        props.enumStringSet = { enumerable: true, set: () => undefined };
      } else if (opt === 'nonenumStringData') {
        props.nonEnumStringData = { enumerable: false, value: 3 };
      } else {
        throw Error(`unknown option ${opt}`);
      }
    }
    // @ts-ignore Don't yet understand typing, but want dynamic test anyway
    const o = create(objectPrototype, props);
    return harden(o);
  }

  function shouldThrow(opts, message = /XXX/) {
    t.throws(() => ser(build(...opts)), { message });
  }
  const REC_NOACC = /must not be an accessor property:/;
  const REC_ONLYENUM = /must be an enumerable property:/;

  // empty objects

  // rejected because it is not hardened
  t.throws(
    () => ser({}),
    { message: /Cannot pass non-frozen objects/ },
    'non-frozen data cannot be serialized',
  );

  // harden({})
  t.deepEqual(ser(build()), emptyData);

  const key1Data = { body: JSON.stringify({ key1: 'data' }), slots: [] };

  // Serialized data should roundtrip properly
  t.deepEqual(unser(ser(harden({}))), {});
  t.deepEqual(unser(ser(harden({ key1: 'data' }))), { key1: 'data' });

  // unserialized data can be serialized again
  t.deepEqual(ser(unser(emptyData)), emptyData);
  t.deepEqual(ser(unser(key1Data)), key1Data);

  // { key: data }
  // all: pass-by-copy without warning
  t.deepEqual(ser(build('enumStringData')), {
    body: '{"key1":"data"}',
    slots: [],
  });

  // anything with getters is rejected
  shouldThrow(['enumStringGetData'], REC_NOACC);
  shouldThrow(['enumStringGetData', 'enumStringData'], REC_NOACC);
  shouldThrow(['enumStringGetFunc'], REC_NOACC);
  shouldThrow(['enumStringGetFunc', 'enumStringData'], REC_NOACC);
  shouldThrow(['enumStringSet'], REC_NOACC);
  shouldThrow(['enumStringSet', 'enumStringData'], REC_NOACC);

  // anything with non-enumerable properties is rejected
  shouldThrow(['nonenumStringData'], REC_ONLYENUM);
  shouldThrow(['nonenumStringData', 'enumStringData'], REC_ONLYENUM);
});
