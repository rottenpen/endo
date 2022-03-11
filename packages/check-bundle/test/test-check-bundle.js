// @ts-check
import '@endo/init/pre-bundle-source.js';
import '@endo/init';
import test from 'ava';
import * as fs from 'fs';
import * as url from 'url';
import * as crypto from 'crypto';
import bundleSource from '@endo/bundle-source';
import { checkBundle } from '../lite.js';
import {
  checkBundleBytes,
  checkBundleFile,
  checkBundle as checkBundlePowered,
} from '../index.js';

const fixture = url.fileURLToPath(
  new URL('fixture/main.js', import.meta.url).toString(),
);
const bundleFixturePath = url.fileURLToPath(
  new URL('fixture.json', import.meta.url).toString(),
);

/** @param {Uint8Array} bytes */
const computeSha512 = bytes => {
  const hash = crypto.createHash('sha512');
  hash.update(bytes);
  return hash.digest().toString('hex');
};

test('bundle and check get export package', async t => {
  const bundle = await bundleSource(fixture, 'getExport');
  await t.throwsAsync(checkBundle(bundle, computeSha512, 'fixture/main.js'), {
    message: /checkBundle cannot determine hash of bundle with getExport moduleFormat because it is not necessarily consistent/,
  });
});

test('bundle and check nested evaluate package', async t => {
  const bundle = await bundleSource(fixture, 'nestedEvaluate');
  await t.throwsAsync(checkBundle(bundle, computeSha512, 'fixture/main.js'), {
    message: /checkBundle cannot determine hash of bundle with nestedEvaluate moduleFormat because it is not necessarily consistent/,
  });
});

test('bundle and check endo zip base64 package', async t => {
  const bundle = await bundleSource(fixture, 'endoZipBase64');
  await checkBundle(bundle, computeSha512, 'fixture/main.js');
  t.pass();
});

test('bundle and check endo zip base64 package (ambient Node.js powers)', async t => {
  const bundle = await bundleSource(fixture, 'endoZipBase64');
  await checkBundlePowered(bundle, 'fixture/main.js');
  t.pass();
});

test('bundle and check endo zip base64 bundle at path (ambient Node.js powers)', async t => {
  await checkBundleFile(bundleFixturePath);
  t.pass();
});

test('bundle and check endo zip base64 bundle bytes (ambient Node.js powers)', async t => {
  const bytes = await fs.promises.readFile(bundleFixturePath);
  await checkBundleBytes(bytes);
  t.pass();
});

test('bundle and check endo zip base64 package absent hash', async t => {
  const { endoZipBase64Sha512: _, ...lightBundle } = await bundleSource(
    fixture,
    'endoZipBase64',
  );
  Object.freeze(lightBundle);
  await t.throwsAsync(
    checkBundle(lightBundle, computeSha512, 'fixture/main.js'),
    {
      message:
        "checkBundle cannot bundle without the property 'endoZipBase64Sha512', which must be a string, got (a string)",
    },
  );
});

test('bundle and check corrupt endo zip base64 package', async t => {
  const bundle = await bundleSource(fixture, 'endoZipBase64');
  const corruptBundle = harden({
    ...bundle,
    endoZipBase64Sha512:
      '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  });
  await t.throwsAsync(
    checkBundle(corruptBundle, computeSha512, 'fixture/main.js'),
    {
      message: /^Archive compartment map failed a SHA-512 integrity check/,
    },
  );
});

test('bundle and hash unfrozen object', async t => {
  const bundle = {};
  await t.throwsAsync(checkBundle(bundle, computeSha512, 'fixture/main.js'), {
    message: `checkBundle cannot vouch for the ongoing integrity of an unfrozen object, got {}`,
  });
});

test('bundle and hash bogus package', async t => {
  const bundle = Object.freeze({ moduleFormat: 'bogus' });
  await t.throwsAsync(checkBundle(bundle, computeSha512, 'fixture/main.js'), {
    message: `checkBundle cannot determine hash of bundle with unrecognized moduleFormat "bogus"`,
  });
});
