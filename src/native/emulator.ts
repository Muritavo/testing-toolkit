import nodeFetch from "node-fetch";
import { spawn, ChildProcess } from "child_process";

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
      }, 10000);
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
export async function startEmulator(args: {
  /** The project id used by the emulator */
  projectId: string;
  /** Optionally indicates the database to import data from */
  databaseToImport?: string;
  /** The port where the firebase UI will be running to check if the emulator is up */
  UIPort: number;
  /** An optional flag to indicate when a new emulator instance should be created */
  suiteId?: string;
}) {
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

    spawnResult.process.on("close", (e) => {
      clearTimeout(timeout);
      log("Emulator closed with", e);
      rej(
        new Error(
          `Emulator closed with code ${e}. Check the firebse-debug.log for more details`
        )
      );
      spawnResult = undefined as any;
    });
    while (!breakLoop) {
      try {
        log("Checking if emulator is up");
        await nodeFetch(`http://localhost:${args.UIPort}`);
        log("Emulator is up and ready");
        clearTimeout(timeout);
        breakLoop = true;
        r(null);
      } catch (e) {
        log("Process is killed: ", spawnResult?.process.killed);
        log("Emulator is not ready yet, retrying in 1 sec");
      }
      await WaitTimeout(1000);
    }
  });
}
