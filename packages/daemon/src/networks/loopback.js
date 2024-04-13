// @ts-check
import { Far } from '@endo/far';

/**
 * @param {Promise<import('../types.js').EndoGreeter>} greeter
 * @returns {import('@endo/far').FarRef<import('../types.js').EndoNetwork>}
 */
export const makeLoopbackNetwork = greeter => {
  return Far(
    'Loopback Network',
    /** @type {import('../types.js').EndoNetwork} */ ({
      addresses: () => [],
      supports: address => new URL(address).protocol === 'loop:',
      connect: address => {
        if (address !== 'loop:') {
          throw new Error(
            'Failed invariant: loopback only supports "loop:" address',
          );
        }
        return greeter;
      },
    }),
  );
};
