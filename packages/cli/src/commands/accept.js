/* global process */
import os from 'os';
import { E } from '@endo/far';
import { withEndoAgent } from '../context.js';

export const accept = async ({ invitationLocator, guestName, agentNames }) =>
  withEndoAgent(agentNames, { os, process }, async ({ agent }) => {
    const guest = await E(agent).accept(invitationLocator, guestName);
    console.log(guest);
  });
