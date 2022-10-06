import nodeFetch from "node-fetch";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import firebase from "firebase/compat";

let emulatorConfig: FirebaseConfigShape;

/**
 * Deletes a collection from firebase
 * @param projectId The current project id of the emulator instance
 * @param collectionPath The collection path **starting with "/"**
 */
export const deleteCollection = async (
  projectId: string,
  collectionPath: string
) => {
  await nodeFetch(
    `http://localhost:${_getPort(
      "firestore"
    )}/emulator/v1/projects/${projectId}/databases/(default)/documents${collectionPath}`,
    {
      method: "delete",
    }
  );
};

/**
 * Gives the developer the possibility to interact with an admin firestore emulator instance
 * @param projectId The current project id of the emulator instance
 * @param cb The callback to be executed
 */
export const setupEmulator = async (
  projectId: string,
  cb: (firestore: ReturnType<typeof firebase.firestore>) => Promise<void>
) => {
  const testEnv = await initializeTestEnvironment({
    projectId: projectId,
    firestore: {
      host: "localhost",
      port: _getPort("firestore"),
    },
  });
  await testEnv.withSecurityRulesDisabled(async (ctx: any) => {
    await cb(
      ctx.firestore({
        experimentalForceLongPolling: true,
        merge: true
      })
    );
  });
};
/**
 * Creates a user on the auth emulator allowing him to authenticate to the emulator
 * @param projectId The current project id of the emulator instance
 * @param email The email to authenticate the user with
 * @param password The password to authenticate the user with
 * @param localId A deterministic Id to be used for this user
 */
export const addAuthUser = async (
  projectId: string,
  email: string,
  password: string,
  localId: string = ""
) => {
  const result = await nodeFetch(
    `http://localhost:${_getPort(
      "auth"
    )}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`,
    {
      body: JSON.stringify({
        email,
        password,
        localId,
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer owner",
      },
      method: "post",
    }
  );

  if (result.status > 300)
    throw new Error(`Creating account returned ${result.status}`);
};

/**
 * Clears all accounts from the auth emulator
 *
 * @param projectId The current project id of the emulator instance
 */
export const clearAuth = async (projectId: string) => {
  const result = await nodeFetch(
    `http://localhost:${_getPort(
      "auth"
    )}/emulator/v1/projects/${projectId}/accounts`,
    {
      method: "delete",
    }
  );
  if (result.status > 300)
    throw new Error(`Cleaning accounts returned ${result.status}`);
};

/**
 * Sets the emulator ports config
 * @param config Emulator ports config
 */
export function setEmulatorConfig(config: FirebaseConfigShape) {
  emulatorConfig = config;
}

/**
 * Clears all firestore documents from local emulator
 * @param projectId The current project id of the emulator instance
 */
export const clearFirestore = async (projectId: string) => {
  const testEnv = await initializeTestEnvironment({
    projectId: projectId,
    firestore: {
      host: "localhost",
      port: _getPort("firestore"),
    },
  });
  await testEnv.clearFirestore();
  testEnv.cleanup();
};

const FirebaseConfigEmulatorsShapeExample = {
  emulators: {
    auth: {
      port: 9099 as number,
    },
    functions: {
      port: 5001 as number,
    },
    firestore: {
      port: 8080 as number,
    },
    hosting: {
      port: 5000 as number,
    },
    storage: {
      port: 9199 as number,
    },
    pubsub: {
      port: 8055 as number,
    },
    ui: {
      enabled: true,
      port: 4000 as number,
    },
  },
} as const;

export type FirebaseConfigShape = typeof FirebaseConfigEmulatorsShapeExample;

/**
 * Guarantees a firebase config has been provided before using the ports
 * @param emulator The emulator type to get the port from
 * @returns The port
 */
function _getPort(emulator: keyof FirebaseConfigShape["emulators"]) {
  if (!emulatorConfig) {
    throw new Error(`You didn't set the emulator config. Provide it by using the following at your cypress support file:

import { setEmulatorConfig } from '@muritavo/cypress-toolkit/dist/support/emulator'
...
...
...
before() {
    setEmulatorConfig(require("THE_PATH_TO_YOUR_FIREBASE_JSON"))
}
`);
  }
  const emulatorConfigSet = emulatorConfig.emulators[emulator];
  if (!emulatorConfigSet || !emulatorConfigSet.port) {
    throw new Error(`Emulator config not found`);
  }
  return emulatorConfigSet.port;
}
