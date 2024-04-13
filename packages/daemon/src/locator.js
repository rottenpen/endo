// @ts-check

import { parseId, isValidNumber } from './formula-identifier.js';
import { isValidFormulaType } from './formula-type.js';

const { quote: q } = assert;

/**
 * The endo locator format:
 * ```
 * endo://{nodeNumber}/?id={formulaNumber}&type={formulaType}
 * ```
 * Note that the `id` query param is just the formula number.
 */

/**
 * In addition to all valid formula types, the locator `type` query parameter
 * also supports `remote` for remote values, since their actual formula type
 * cannot be known.
 *
 * @param {string} allegedType
 */
const isValidLocatorType = allegedType =>
  isValidFormulaType(allegedType) || allegedType === 'remote';

/**
 * @param {string} allegedType
 */
const assertValidLocatorType = allegedType => {
  if (!isValidLocatorType(allegedType)) {
    assert.Fail`Unrecognized locator type ${q(allegedType)}`;
  }
};

/** @param {string} allegedLocator */
export const parseLocator = allegedLocator => {
  const errorPrefix = `Invalid locator ${q(allegedLocator)}:`;

  if (!URL.canParse(allegedLocator)) {
    assert.Fail`${errorPrefix} Invalid URL.`;
  }
  const url = new URL(allegedLocator);

  if (!allegedLocator.startsWith('endo://')) {
    assert.Fail`${errorPrefix} Invalid protocol.`;
  }

  const node = url.host;
  if (!isValidNumber(node)) {
    assert.Fail`${errorPrefix} Invalid node identifier.`;
  }

  if (
    url.searchParams.size !== 2 ||
    !url.searchParams.has('id') ||
    !url.searchParams.has('type')
  ) {
    assert.Fail`${errorPrefix} Invalid search params.`;
  }

  const id = url.searchParams.get('id');
  if (id === null || !isValidNumber(id)) {
    assert.Fail`${errorPrefix} Invalid id.`;
  }

  const formulaType = url.searchParams.get('type');
  if (formulaType === null || !isValidLocatorType(formulaType)) {
    assert.Fail`${errorPrefix} Invalid type.`;
  }

  /** @type {{ formulaType: string, node: string, id: string }} */
  return { formulaType, node, id };
};

/** @param {string} allegedLocator */
export const assertValidLocator = allegedLocator => {
  parseLocator(allegedLocator);
};

/**
 * @param {string} id - The full formula identifier.
 * @param {string} formulaType - The type of the formula with the given id.
 */
export const formatLocator = (id, formulaType) => {
  const { number, node } = parseId(id);
  const url = new URL(`endo://${node}`);
  url.pathname = '/';

  // The id query param is just the number
  url.searchParams.set('id', number);

  assertValidLocatorType(formulaType);
  url.searchParams.set('type', formulaType);

  return url.toString();
};
