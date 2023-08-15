/* global process */

import os from 'os';
import { E } from '@endo/far';
import { makeRefIterator } from '@endo/daemon';
import { withEndoParty } from './context.js';

export const inbox = async ({
  cancel,
  cancelled,
  sockPath,
  follow,
  partyNames,
}) =>
  withEndoParty(partyNames, { os, process }, async ({ party }) => {
    const messages = follow
      ? makeRefIterator(E(party).followMessages())
      : await E(party).listMessages();
    for await (const message of messages) {
      const { number, who, when } = message;
      if (message.type === 'request') {
        const { what } = message;
        console.log(
          `${number}. ${JSON.stringify(who)} requested ${JSON.stringify(
            what,
          )} at ${JSON.stringify(when)}`,
        );
      } else {
        console.log(
          `${number}. ${JSON.stringify(
            who,
          )} sent an unrecognizable message at ${JSON.stringify(
            when,
          )}. Consider upgrading.`,
        );
      }
    }
  });
