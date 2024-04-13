// @ts-check

/**
 * @param {string} localNodeId
 */
export const makeRemoteControlProvider = localNodeId => {
  /** @type {Map<string, import('./types.js').RemoteControl>} */
  const remoteControls = new Map();

  /** @param {string} remoteNodeId */
  const makeRemoteControl = remoteNodeId => {
    /** @type {import('./types.js').RemoteControlState} */
    let state;

    // In this state, we have received a remoteGateway from an ingress
    // connection (and provided our local gateway to them.)
    // We do not have a pending outbound connection attempt.
    /**
     * @type {(
     *   remoteGateway: Promise<import('./types.js').EndoGateway>,
     *   cancel: (error: Error) => void,
     *   cancelled: Promise<never>,
      ) => import('./types.js').RemoteControlState} */
    const accepted = (remoteGateway, cancelCurrent, currentCancelled) => {
      return {
        accept(_proposedRemoteGateway, proposedCancel, _proposedCancelled) {
          // And we receive an inbound connection.
          // There are two possibilities:
          // The sender raced multiple outbound connections and this connection
          // lost the race.
          // Or, the sender restarted but left a prior connection half-open.
          // We consider the race to be the common consideration and that
          // replacing peers after establishing a connection would be far to
          // disruptive.
          // TODO: For the case where we leave a peer wedged half-open, we
          // will need health checks.
          proposedCancel(new Error('Already accepted a connection.'));
          return accepted(remoteGateway, cancelCurrent, currentCancelled);
        },
        connect(_getProposedRemoteGateway, proposedCancel, proposedCancelled) {
          // Use the gateway we already have.
          // Bind the fates of the current peer incarnation and the inbound
          // connection.
          currentCancelled.catch(proposedCancel);
          proposedCancelled.catch(cancelCurrent);
          return {
            state: accepted(remoteGateway, proposedCancel, proposedCancelled),
            remoteGateway,
          };
        },
      };
    };

    // We have an active outbound connection.
    /**
     * @type {(
     *   remoteGateway: Promise<import('./types.js').EndoGateway>,
     *   cancel: (error: Error) => void,
     *   cancelled: Promise<never>,
      ) => import('./types.js').RemoteControlState} */
    const connected =
      remoteNodeId > localNodeId
        ? (remoteGateway, cancelCurrent, currentCancelled) => {
            // We are biased toward preserving our own outbound connection.
            return {
              accept(
                _proposedRemoteGateway,
                proposedCancel,
                _proposedCancelled,
              ) {
                // We receive an inbound connection.
                // We favor our outbound connection,
                // so cancel the inbound.
                proposedCancel(
                  new Error(
                    'Connection refused: already connected (crossed hellos, connect bias)',
                  ),
                );
                return connected(
                  remoteGateway,
                  cancelCurrent,
                  currentCancelled,
                );
              },
              connect(
                _getProposedRemoteGateway,
                proposedCancel,
                proposedCancelled,
              ) {
                // The corresponding peer is incarnated.
                // Bind the fates of this incarnation with the existing connection.
                proposedCancelled.catch(cancelCurrent);
                currentCancelled.catch(proposedCancel);
                return {
                  state: connected(
                    remoteGateway,
                    proposedCancel,
                    proposedCancelled,
                  ),
                  remoteGateway,
                };
              },
            };
          }
        : (remoteGateway, cancelCurrent, currentCancelled) => {
            // We are biased toward preserving inbound connections.
            return {
              accept(proposedRemoteGateway, proposedCancel, proposedCancelled) {
                // We receive an inbound connection.
                // Ditch our outbound connection.
                cancelCurrent(
                  new Error(
                    'Connection abandoned: accepted new connection (crossed hellos, accept bias)',
                  ),
                );
                // Arrange to retrun to the initial state if we lose this new
                // connection.
                proposedCancelled.catch(() => {
                  // I would gladly declare you Tuesday for a call today.
                  // eslint-disable-next-line no-use-before-define
                  state = start();
                });
                return accepted(
                  proposedRemoteGateway,
                  proposedCancel,
                  proposedCancelled,
                );
              },
              connect(
                _getProposedRemoteGateway,
                proposedCancel,
                proposedCancelled,
              ) {
                // We incarnate the corresponding peer.
                // Bind the fates of the new peer with the existing connection.
                proposedCancelled.catch(cancelCurrent);
                currentCancelled.catch(proposedCancel);
                return {
                  state: connected(
                    remoteGateway,
                    proposedCancel,
                    proposedCancelled,
                  ),
                  remoteGateway,
                };
              },
            };
          };

    /** @type {() => import('./types.js').RemoteControlState} */
    const start = () => {
      return {
        accept: (proposedRemoteGateway, cancelCurrent, currentCancelled) => {
          currentCancelled.catch(() => {
            state = start();
          });
          return accepted(
            proposedRemoteGateway,
            cancelCurrent,
            currentCancelled,
          );
        },
        connect: (getRemoteGateway, cancelCurrent, currentCancelled) => {
          currentCancelled.catch(() => {
            state = start();
          });
          const remoteGateway = getRemoteGateway();
          return {
            state: connected(remoteGateway, cancelCurrent, currentCancelled),
            remoteGateway,
          };
        },
      };
    };

    state = start();

    /**
     * @param {Promise<import('./types.js').EndoGateway>} proposedRemoteGateway
     * @param {(error: Error) => void} cancelConnection
     * @param {Promise<never>} connectionCancelled
     */
    const accept = (
      proposedRemoteGateway,
      cancelConnection,
      connectionCancelled,
    ) => {
      state = state.accept(
        proposedRemoteGateway,
        cancelConnection,
        connectionCancelled,
      );
    };
    /**
     * @param {() => Promise<import('./types.js').EndoGateway>} getRemoteGateway
     * @param {(error: Error) => void} cancelIncarnation
     * @param {Promise<never>} incarnationCancelled
     */
    const connect = (
      getRemoteGateway,
      cancelIncarnation,
      incarnationCancelled,
    ) => {
      const { state: nextState, remoteGateway } = state.connect(
        getRemoteGateway,
        cancelIncarnation,
        incarnationCancelled,
      );
      state = nextState;
      return remoteGateway;
    };

    return { accept, connect };
  };

  /** @param {string} remoteNodeId */
  const provideRemoteControl = remoteNodeId => {
    let remoteControl = remoteControls.get(remoteNodeId);
    if (remoteControl === undefined) {
      remoteControl = makeRemoteControl(remoteNodeId);
      remoteControls.set(remoteNodeId, remoteControl);
    }
    return remoteControl;
  };

  return provideRemoteControl;
};
