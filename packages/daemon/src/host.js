// @ts-check
/// <reference types="ses"/>

import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeIteratorRef } from './reader-ref.js';
import { assertPetName, petNamePathFrom } from './pet-name.js';
import { parseId, formatId } from './formula-identifier.js';
import { makePetSitter } from './pet-sitter.js';
import { makeDeferredTasks } from './deferred-tasks.js';

const { quote: q } = assert;

/** @param {string} name */
const assertPowersName = name => {
  ['NONE', 'AGENT', 'ENDO'].includes(name) || assertPetName(name);
};

/**
 * @param {object} args
 * @param {import('./types.js').DaemonCore['provide']} args.provide
 * @param {import('./types.js').DaemonCore['provideController']} args.provideController
 * @param {import('./types.js').DaemonCore['cancelValue']} args.cancelValue
 * @param {import('./types.js').DaemonCore['formulateWorker']} args.formulateWorker
 * @param {import('./types.js').DaemonCore['formulateHost']} args.formulateHost
 * @param {import('./types.js').DaemonCore['formulateGuest']} args.formulateGuest
 * @param {import('./types.js').DaemonCore['formulateEval']} args.formulateEval
 * @param {import('./types.js').DaemonCore['formulateUnconfined']} args.formulateUnconfined
 * @param {import('./types.js').DaemonCore['formulateBundle']} args.formulateBundle
 * @param {import('./types.js').DaemonCore['formulateReadableBlob']} args.formulateReadableBlob
 * @param {import('./types.js').DaemonCore['formulateInvitation']} args.formulateInvitation
 * @param {import('./types.js').DaemonCore['getAllNetworkAddresses']} args.getAllNetworkAddresses
 * @param {import('./types.js').MakeMailbox} args.makeMailbox
 * @param {import('./types.js').MakeDirectoryNode} args.makeDirectoryNode
 * @param {string} args.ownNodeIdentifier
 */
export const makeHostMaker = ({
  provide,
  provideController,
  cancelValue,
  formulateWorker,
  formulateHost,
  formulateGuest,
  formulateEval,
  formulateUnconfined,
  formulateBundle,
  formulateReadableBlob,
  formulateInvitation,
  getAllNetworkAddresses,
  makeMailbox,
  makeDirectoryNode,
  ownNodeIdentifier,
}) => {
  /**
   * @param {string} hostId
   * @param {string} handleId
   * @param {string} storeId
   * @param {string} inspectorId
   * @param {string} mainWorkerId
   * @param {string} endoId
   * @param {string} networksDirectoryId
   * @param {string} leastAuthorityId
   * @param {{[name: string]: string}} platformNames
   * @param {import('./types.js').Context} context
   */
  const makeHost = async (
    hostId,
    handleId,
    storeId,
    inspectorId,
    mainWorkerId,
    endoId,
    networksDirectoryId,
    leastAuthorityId,
    platformNames,
    context,
  ) => {
    context.thisDiesIfThatDies(storeId);
    context.thisDiesIfThatDies(mainWorkerId);

    const basePetStore = await provide(storeId, 'pet-store');
    const specialStore = makePetSitter(basePetStore, {
      ...platformNames,
      AGENT: hostId,
      SELF: handleId,
      ENDO: endoId,
      NETS: networksDirectoryId,
      INFO: inspectorId,
      NONE: leastAuthorityId,
    });

    const mailbox = makeMailbox({
      petStore: specialStore,
      selfId: handleId,
      context,
    });
    const { petStore, handle } = mailbox;
    const directory = makeDirectoryNode(petStore);

    const getEndoBootstrap = async () => provide(endoId, 'endo');

    /**
     * @param {import('@endo/eventual-send').ERef<AsyncIterableIterator<string>>} readerRef
     * @param {string} [petName]
     */
    const store = async (readerRef, petName) => {
      /** @type {import('./types.js').DeferredTasks<import('./types.js').ReadableBlobDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      if (petName !== undefined) {
        assertPetName(petName);
        tasks.push(identifiers =>
          petStore.write(petName, identifiers.readableBlobId),
        );
      }

      const { value } = await formulateReadableBlob(readerRef, tasks);
      return value;
    };

    /**
     * @param {string} workerName
     */
    const provideWorker = async workerName => {
      /** @type {import('./types.js').DeferredTasks<import('./types.js').WorkerDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      // eslint-disable-next-line no-use-before-define
      const workerId = prepareWorkerFormulation(workerName, tasks.push);

      if (workerId !== undefined) {
        return provide(workerId, 'worker');
      }

      const { value } = await formulateWorker(tasks);
      return value;
    };

    /**
     * @param {string} workerName
     * @param {import('./types.js').DeferredTasks<{ workerId: string }>['push']} deferTask
     */
    const prepareWorkerFormulation = (workerName, deferTask) => {
      if (workerName === 'MAIN') {
        return mainWorkerId;
      } else if (workerName === 'NEW') {
        return undefined;
      }

      const workerId = petStore.identifyLocal(workerName);
      if (workerId === undefined) {
        deferTask(identifiers =>
          petStore.write(workerName, identifiers.workerId),
        );
      }
      return workerId;
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     * @param {string} source
     * @param {string[]} codeNames
     * @param {(string | string[])[]} petNamePaths
     * @param {string} resultName
     */
    const evaluate = async (
      workerName,
      source,
      codeNames,
      petNamePaths,
      resultName,
    ) => {
      if (resultName !== undefined) {
        assertPetName(resultName);
      }
      if (petNamePaths.length !== codeNames.length) {
        throw new Error('Evaluator requires one pet name for each code name');
      }

      /** @type {import('./types.js').DeferredTasks<import('./types.js').EvalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const workerId = prepareWorkerFormulation(workerName, tasks.push);

      /** @type {(string | string[])[]} */
      const endowmentFormulaIdsOrPaths = petNamePaths.map(
        (petNameOrPath, index) => {
          if (typeof codeNames[index] !== 'string') {
            throw new Error(`Invalid endowment name: ${q(codeNames[index])}`);
          }

          const petNamePath = petNamePathFrom(petNameOrPath);
          if (petNamePath.length === 1) {
            const id = petStore.identifyLocal(petNamePath[0]);
            if (id === undefined) {
              throw new Error(`Unknown pet name ${q(petNamePath[0])}`);
            }
            return id;
          }

          return petNamePath;
        },
      );

      if (resultName !== undefined) {
        tasks.push(identifiers =>
          petStore.write(resultName, identifiers.evalId),
        );
      }

      const { value } = await formulateEval(
        hostId,
        source,
        codeNames,
        endowmentFormulaIdsOrPaths,
        tasks,
        workerId,
      );
      return value;
    };

    /**
     * Helper function for makeUnconfined and makeBundle.
     * @param {string} powersName
     * @param {string} workerName
     * @param {string} [resultName]
     */
    const prepareMakeCaplet = (powersName, workerName, resultName) => {
      assertPowersName(powersName);

      /** @type {import('./types.js').DeferredTasks<import('./types.js').MakeCapletDeferredTaskParams>} */
      const tasks = makeDeferredTasks();

      const workerId = prepareWorkerFormulation(workerName, tasks.push);

      const powersId = petStore.identifyLocal(powersName);
      if (powersId === undefined) {
        tasks.push(identifiers =>
          petStore.write(powersName, identifiers.powersId),
        );
      }

      if (resultName !== undefined) {
        tasks.push(identifiers =>
          petStore.write(resultName, identifiers.capletId),
        );
      }

      return { tasks, workerId, powersId };
    };

    /** @type {import('./types.js').EndoHost['makeUnconfined']} */
    const makeUnconfined = async (
      workerName,
      specifier,
      powersName,
      resultName,
    ) => {
      const { tasks, workerId, powersId } = prepareMakeCaplet(
        powersName,
        workerName,
        resultName,
      );

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value } = await formulateUnconfined(
        hostId,
        handleId,
        specifier,
        tasks,
        workerId,
        powersId,
      );
      return value;
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     * @param {string} bundleName
     * @param {string | 'NONE' | 'SELF' | 'ENDO'} powersName
     * @param {string} resultName
     */
    const makeBundle = async (
      workerName,
      bundleName,
      powersName,
      resultName,
    ) => {
      const bundleId = petStore.identifyLocal(bundleName);
      if (bundleId === undefined) {
        throw new TypeError(`Unknown pet name for bundle: ${q(bundleName)}`);
      }

      const { tasks, workerId, powersId } = prepareMakeCaplet(
        powersName,
        workerName,
        resultName,
      );

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value } = await formulateBundle(
        hostId,
        handleId,
        bundleId,
        tasks,
        workerId,
        powersId,
      );
      return value;
    };

    /**
     * Attempts to introduce the given names to the specified agent. The agent in question
     * must be formulated before this function is called.
     *
     * @param {string} agentId - The agent's formula identifier.
     * @param {Record<string,string>} introducedNames - The names to introduce.
     * @returns {Promise<void>}
     */
    const introduceNamesToAgent = async (agentId, introducedNames) => {
      const agent = await provide(agentId, 'agent');
      await Promise.all(
        Object.entries(introducedNames).map(async ([parentName, childName]) => {
          const introducedId = petStore.identifyLocal(parentName);
          if (introducedId === undefined) {
            return;
          }
          await agent.write([childName], introducedId);
        }),
      );
    };

    /**
     * @template {'host' | 'guest' | 'agent'} T
     * @param {string} [petName] - The agent's potential pet name.
     * @param {T} [type]
     */
    const getNamedAgent = (petName, type) => {
      if (petName !== undefined) {
        const id = petStore.identifyLocal(petName);
        if (id !== undefined) {
          return {
            id,
            value: provide(id, type),
          };
        }
      }
      return undefined;
    };

    /**
     * @param {string} [handleName] - The pet name of the handle.
     * @param {string} [agentName] - The pet name of the agent.
     */
    const getDeferredTasksForAgent = (handleName, agentName) => {
      /** @type {import('./types.js').DeferredTasks<import('./types.js').AgentDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      if (handleName !== undefined) {
        tasks.push(identifiers =>
          petStore.write(handleName, identifiers.handleId),
        );
      }
      if (agentName !== undefined) {
        tasks.push(identifiers =>
          petStore.write(agentName, identifiers.agentId),
        );
      }
      return tasks;
    };

    /**
     * @param {string} [petName]
     * @param {import('./types.js').MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{id: string, value: Promise<import('./types.js').EndoHost>}>}
     */
    const makeChildHost = async (
      petName,
      { introducedNames = {}, agentName = undefined } = {},
    ) => {
      let host = getNamedAgent(petName, 'host');
      if (host === undefined) {
        const { value, id } =
          // Behold, recursion:
          await formulateHost(
            endoId,
            networksDirectoryId,
            getDeferredTasksForAgent(petName, agentName),
          );
        host = { value: Promise.resolve(value), id };
      }

      await introduceNamesToAgent(host.id, introducedNames);

      /** @type {{ id: string, value: Promise<import('./types.js').EndoHost> }} */
      return host;
    };

    /** @type {import('./types.js').EndoHost['provideHost']} */
    const provideHost = async (petName, opts) => {
      const { value } = await makeChildHost(petName, opts);
      return value;
    };

    /**
     * @param {string} [handleName]
     * @param {import('./types.js').MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{id: string, value: Promise<import('./types.js').EndoGuest>}>}
     */
    const makeGuest = async (
      handleName,
      { introducedNames = {}, agentName = undefined } = {},
    ) => {
      let guest = getNamedAgent(handleName, 'guest');
      if (guest === undefined) {
        const { value, id } =
          // Behold, recursion:
          await formulateGuest(
            hostId,
            handleId,
            getDeferredTasksForAgent(handleName, agentName),
          );
        guest = { value: Promise.resolve(value), id };
      }

      await introduceNamesToAgent(guest.id, introducedNames);

      /** @type {{ id: string, value: Promise<import('./types.js').EndoGuest> }} */
      return guest;
    };

    /** @type {import('./types.js').EndoHost['provideGuest']} */
    const provideGuest = async (petName, opts) => {
      const { value } = await makeGuest(petName, opts);
      return value;
    };

    /**
     * @param {string} guestName
     */
    const invite = async guestName => {
      // We must immediately retain a formula under guestName so that we
      // preserve the invitation across restarts, but we must replace the
      // guestName with the handle of the guest that accepts the invitation.
      // We need to return the locator for the invitation regardless of what
      // we store.
      // Overwriting the guestName must cancel the pending invitation (consume
      // once) so that the invitation can no longer modify the petStore entry
      // for the guestName.
      /** @type {import('./types.js').DeferredTasks<import('./types.js').InvitationDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      tasks.push(identifiers =>
        petStore.write(guestName, identifiers.invitationId),
      );
      const { value } = await formulateInvitation(
        hostId,
        handleId,
        guestName,
        tasks,
      );
      return value;
    };

    /**
     * @param {string} invitationLocator
     * @param {string} guestName
     */
    const accept = async (invitationLocator, guestName) => {
      const url = new URL(invitationLocator);
      const nodeNumber = url.hostname;
      const invitationNumber = url.searchParams.get('id');
      const remoteHandleNumber = url.searchParams.get('from');
      const addresses = url.searchParams.getAll('at');

      nodeNumber || assert.Fail`Invitation must have a hostname`;
      if (!remoteHandleNumber) {
        throw assert.error(`Invitation must have a "from" parameter`);
      }
      if (invitationNumber === null) {
        throw assert.error(`Invitation must have an "id" parameter`);
      }

      /** @type {import('./types.js').PeerInfo} */
      const peerInfo = {
        node: nodeNumber,
        addresses,
      };
      // eslint-disable-next-line no-use-before-define
      await addPeerInfo(peerInfo);

      const guestHandleId = formatId({
        number: remoteHandleNumber,
        node: nodeNumber,
      });
      const invitationId = formatId({
        number: invitationNumber,
        node: nodeNumber,
      });

      const { number: handleNumber } = parseId(handleId);
      // eslint-disable-next-line no-use-before-define
      const { addresses: hostAddresses } = await getPeerInfo();
      const handleUrl = new URL('endo://');
      handleUrl.hostname = ownNodeIdentifier;
      handleUrl.searchParams.set('id', handleNumber);
      for (const address of hostAddresses) {
        handleUrl.searchParams.append('at', address);
      }
      const handleLocator = handleUrl.href;

      const invitation = await provide(invitationId, 'invitation');
      await E(invitation).accept(handleLocator);
      await petStore.write(guestName, guestHandleId);
    };

    /** @type {import('./types.js').EndoHost['cancel']} */
    const cancel = async (petName, reason = new Error('Cancelled')) => {
      const id = petStore.identifyLocal(petName);
      if (id === undefined) {
        throw new TypeError(`Unknown pet name: ${q(petName)}`);
      }
      return cancelValue(id, reason);
    };

    /** @type {import('./types.js').EndoHost['gateway']} */
    const gateway = async () => {
      const endoBootstrap = getEndoBootstrap();
      return E(endoBootstrap).gateway();
    };

    /** @type {import('./types.js').EndoHost['addPeerInfo']} */
    const addPeerInfo = async peerInfo => {
      const endoBootstrap = getEndoBootstrap();
      await E(endoBootstrap).addPeerInfo(peerInfo);
    };

    /** @type {import('./types.js').EndoHost['getPeerInfo']} */
    const getPeerInfo = async () => {
      const addresses = await getAllNetworkAddresses(networksDirectoryId);
      const peerInfo = {
        node: ownNodeIdentifier,
        addresses,
      };
      return peerInfo;
    };

    const { reverseIdentify } = specialStore;
    const {
      has,
      identify,
      lookup,
      locate,
      list,
      listIdentifiers,
      followChanges,
      reverseLookup,
      write,
      remove,
      move,
      copy,
      makeDirectory,
    } = directory;
    const {
      listMessages,
      followMessages,
      resolve,
      reject,
      adopt,
      dismiss,
      request,
      send,
      deliver,
    } = mailbox;

    /** @type {import('./types.js').EndoHost} */
    const host = {
      // Directory
      has,
      identify,
      reverseIdentify,
      locate,
      list,
      listIdentifiers,
      followChanges,
      lookup,
      reverseLookup,
      write,
      remove,
      move,
      copy,
      makeDirectory,
      // Mail
      handle,
      listMessages,
      followMessages,
      resolve,
      reject,
      adopt,
      dismiss,
      request,
      send,
      // Host
      store,
      provideGuest,
      provideHost,
      provideWorker,
      evaluate,
      makeUnconfined,
      makeBundle,
      cancel,
      gateway,
      getPeerInfo,
      addPeerInfo,
      deliver,
      invite,
      accept,
    };

    const hostExo = makeExo(
      'EndoHost',
      M.interface('EndoHost', {}, { defaultGuards: 'passable' }),
      {
        ...host,
        followChanges: () => makeIteratorRef(host.followChanges()),
        followMessages: () => makeIteratorRef(host.followMessages()),
      },
    );

    await provide(mainWorkerId, 'worker');

    return hostExo;
  };

  return makeHost;
};
