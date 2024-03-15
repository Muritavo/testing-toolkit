import nodeFetch from "node-fetch";
import { spawn, ChildProcess } from "child_process";
import killPort from "kill-port";
import { LOCALHOST_DOMAIN } from "./consts";

const log = require("debug")("@muritavo/testing-toolkit/emulator");
let spawnResult: {
  project: string;
  database?: string;
  process: ChildProcess;
  id: string;
};
function WaitTimeout(ml = 200) {
  return new Promise<void>((r) => {
    setTimeout(() => {
      r();
    }, ml);
  });
}

/**
 * Kills the emulator that was started by this module instance
 *
 * @returns A promise that resolves when the emulator is succesfully killed
 */
export async function killEmulator() {
  if (!spawnResult) return Promise.resolve(null);
  return new Promise((r, rej) => {
    try {
      const t = setTimeout(() => {
        spawnResult = undefined as any;
        rej(new Error("Couldn't kill emulator"));
      }, 20000);
      spawnResult.process.on("close", () => {
        clearTimeout(t);
        r(null);
      });
      spawnResult.process.kill("SIGINT");
    } catch (e) {
      console.log("Unhandled exception", e);
      r(null);
    }
  });
}

/**
 * With this you can start an firebase emulator
 * @param args Check property typings for details
 * @returns A promise that resolves when the emulator is ready or fails if the emulator couldn't start or be reached
 */
export async function startEmulator(
  args: {
    /** The project id used by the emulator */
    projectId: string;
    /** Optionally indicates the database to import data from */
    databaseToImport?: string;
    /** The port where the firebase UI will be running to check if the emulator is up */
    UIPort: number;
    /** An optional flag to indicate when a new emulator instance should be created */
    suiteId?: string;

    ports: number[];
    shouldSaveData: boolean;
    only:
      | ("functions" | "hosting" | "firestore" | "storage" | "auth")[]
      | string[];
  },
  isRetry: boolean = false
) {
  const suiteId = args.suiteId || args.databaseToImport || "default";
  log("Spawning emulator process");
  if (suiteId === spawnResult?.id) {
    log(`Emulator with suite id ${suiteId} already running`);
    return null;
  } else await killEmulator();
  spawnResult = {
    id: suiteId,
    project: args.projectId,
    database: args.databaseToImport,
    process: spawn(
      `firebase emulators:start -P ${args.projectId} ${
        args.databaseToImport ? `--import ${args.databaseToImport}` : ""
      } ${args.shouldSaveData ? `--export-on-exit` : ""} ${
        args.only.length ? `--only=${args.only.join(",")}` : ""
      }`,
      {
        cwd: undefined,
        env: process.env,
        shell: true,
      }
    ),
  };

  /**
   * This script exists so we can start an emulator from inside cypress
   */
  return new Promise<null>(async (r, rej) => {
    let breakLoop = false;
    const timeout = setTimeout(() => {
      breakLoop = true;
      console.error("Could not receive ok from firebase emulator");
      clearTimeout(timeout);
      rej(new Error("Timeout"));
      spawnResult = undefined as any;
    }, 30000);

    log("Process is killed: ", spawnResult.process.killed);
    log("Process exit code", spawnResult.process.exitCode);

    spawnResult.process.on("error", (e) => {
      clearTimeout(timeout);
      log("Spawning emulator process failed with error", e.message);
      rej(
        new Error(`Spawning emulator process failed with error ${e.message}`)
      );
      spawnResult = undefined as any;
    });

    spawnResult.process.on("message", (e) => {
      log("Emulator start sent message", e.toString());
    });

    let scriptOutput = "";
    spawnResult.process.stdout!.on("data", function (data) {
      data = data.toString();
      scriptOutput += data;
    });

    spawnResult.process.on("close", (e) => {
      clearTimeout(timeout);
      log("Emulator closed with", e);
      const unavailablePorts = args.ports.filter((p) =>
        scriptOutput.includes(String(p))
      );
      const failedWithUnavailablePort = unavailablePorts.length && e !== 0;
      if (failedWithUnavailablePort) {
        log(
          "Killing ports",
          unavailablePorts,
          "detected from text",
          scriptOutput
        );
        Promise.all(
          unavailablePorts.map((p) => killPort(p).catch(() => {}))
        ).then(() => {
          if (isRetry === false) return startEmulator(args, true);
          else
            rej(
              new Error(
                `Some ports were unavailable (${unavailablePorts.join(
                  ", "
                )}). They were killed, please try running the emulator again`
              )
            );
        });
      } else {
        rej(
          new Error(
            `Emulator closed with code ${e}. Check the firebase-debug.log for more details.
Command output was:
${scriptOutput}`
          )
        );
      }
      spawnResult = undefined as any;
    });
    while (!breakLoop) {
      try {
        log("Checking if emulator is up");
        await nodeFetch(`http://${LOCALHOST_DOMAIN}:${args.UIPort}`);
        log("Emulator is up and ready");
        clearTimeout(timeout);
        breakLoop = true;
        r(null);
      } catch (e) {
        log(e);
        log("Process is killed: ", spawnResult?.process.killed);
        log("Emulator is not ready yet, retrying in 1 sec");
      }
      await WaitTimeout(1000);
    }
  });
}

type Admin = ReturnType<typeof _getAuthAdminInstance>;
type KeysWithValsOfType<T, V> = keyof {
  [P in keyof T as T[P] extends V ? P : never]: P;
};

export async function invokeAuthAdmin<
  F extends KeysWithValsOfType<Admin, (...params: any[]) => any>
>({
  projectId,
  port,
  functionName,
  params,
}: {
  projectId: string;
  port: string;
  functionName: F;
  params: Parameters<Admin[F]>;
}) {
  const app = await _getAuthAdminInstance(projectId, port);
  const func = app[functionName];
  await (func.bind(app) as any)(...params);
  return null;
}

let adminApp: {
  [projectId: string]: ReturnType<
    typeof import("firebase-admin/app")["initializeApp"]
  >;
} = {};

async function _getAuthAdminInstance(projectId: string, authPort: string) {
  const { initializeApp } = require("firebase-admin/app");
  const { getAuth } = require("firebase-admin/auth");
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `${LOCALHOST_DOMAIN}:${authPort}`;
  adminApp[projectId] =
    adminApp[projectId] || initializeApp({ projectId }, projectId);
  return getAuth(adminApp[projectId]);
}
