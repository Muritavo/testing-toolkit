import debug from "debug";
import GenericContract from "../types/contract";
import { setPort } from "../client/blockchain";
import { execSync, exec } from "child_process";
import { wait } from "../utility";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { Typed } from "ethers";
import { JsonRpcServer } from "hardhat/types";

export const blockchainLogger = debug("@muritavo/testing-toolkit/blockchain");

// This register the tasks for deploying a hardhat blockchain
type Addresses = { [wallet: string]: { secretKey: string } };
let instance: {
  process: typeof import("hardhat") & {
    ethers: import("@nomicfoundation/hardhat-ethers/types").HardhatEthersHelpers;
  };
  rootFolder?: string;
  contracts: {
    [id: string]: {
      address: string;
    };
  };
  addresses: Addresses;
  port: number;
  graphqlProject: string | undefined;
  hardhatServer: JsonRpcServer;
} | null;

export async function startBlockchain({
  projectRootFolder: projectFolder,
  port = 8545,
  graphqlProject,
}: {
  /** The NFT projects root folder so the contracts can be deployed from */
  projectRootFolder: string;
  /**
   * This indicates the port the ganache server will run at
   * @default 8545
   * */
  port?: number;
  /**
   * Adds support for graphql for listening to blockchain events and indexing information.
   */
  graphqlProject?: string;
}) {
  if (instance) {
    const prevFork = instance.process.config.networks.hardhat.forking;
    blockchainLogger(
      prevFork ? `Reseting blockchain fork` : "No previous fork, skipping reset"
    );
    if (prevFork) {
      try {
        const blockNumberBeforeReset =
          await instance.process.ethers.provider.getBlockNumber();
        blockchainLogger(`Previous block number ${blockNumberBeforeReset}`);
        /** This will clear any logs/changes made during testing */
        await instance.process.network.provider.request({
          method: "hardhat_reset",
          params: [
            {
              forking: {
                jsonRpcUrl: prevFork.url,
                blockNumber: prevFork.blockNumber,
              },
            },
          ],
        });
        const blockNumberAfterReset =
          await instance.process.ethers.provider.getBlockNumber();
        blockchainLogger(`Reset back to block number ${blockNumberAfterReset}`);
        const advanceBlockNumbersBy =
          blockNumberBeforeReset - blockNumberAfterReset;
        /**
         * When using graph-node, it refuses to reprocess previous blocks
         * So in a cenario where we republish a graph after this reset, it doesn't read the new logs
         *
         * That's why, after the reset, we "skip" blocks back to the latest block, and continue testing from there
         * */
        await instance.process.network.provider.request({
          method: "hardhat_mine",
          params: [`0x${advanceBlockNumbersBy.toString(16)}`],
        });

        blockchainLogger(
          `Reset hardhat state (#${blockNumberBeforeReset} to #${blockNumberAfterReset}) and now it's at block ${await instance.process.ethers.provider.getBlockNumber()}`
        );
      } catch (e) {
        blockchainLogger("Error when trying to reset fork", e)
      }
    }

    return instance.addresses;
  }
  if (projectFolder)
    blockchainLogger(`Starting blockchain server at "${projectFolder}"`);
  if (graphqlProject) {
    execSync("docker compose up --detach", {
      cwd: graphqlProject,
      stdio: "ignore",
    });
    process.on("SIGINT", function () {
      execSync("docker compose down", {
        cwd: graphqlProject,
        stdio: "ignore",
      });
    });
  }

  /**
   * This will start a hardhat node
   */
  const serverInstance = await initHardhat(projectFolder);
  let hardhatServer: JsonRpcServer;
  await new Promise<void>((r, rej) => {
    const timeoutId = setTimeout(() => {
      rej(new Error(`Something went wrong while starting hardhat node`));
    }, 30000);
    serverInstance.tasks[
      serverInstance.taskNames.TASK_NODE_SERVER_READY
    ].setAction(async (args) => {
      hardhatServer = args.server;
      clearTimeout(timeoutId);
      r();
    });
    serverInstance.run("node", {
      port,
      noDeploy: true,
    });
  });
  const accounts = new Array(
    (serverInstance.config.networks.hardhat.accounts as any).count
  )
    .fill(undefined)
    .reduce((res, _, idx) => {
      const account = deriveWallet(idx, serverInstance);
      return {
        ...res,
        [account.address]: {
          secretKey: account.key,
        },
      };
    }, {}) as { [wallet: string]: { secretKey: string } };
  instance = {
    process: serverInstance,
    rootFolder: projectFolder,
    contracts: {},
    addresses: accounts,
    port,
    graphqlProject,
    hardhatServer,
  };
  setPort(port);
  return accounts;
}

export function deriveWallet(index: number = 0, hardhat: any) {
  const ethers = hardhat.ethers as typeof import("ethers");
  const accounts = hardhat.config.networks.hardhat.accounts;
  const wallet = ethers.HDNodeWallet.fromMnemonic(
    ethers.Mnemonic.fromPhrase(accounts.mnemonic),
    accounts.path + `/${index}`
  );
  return {
    key: wallet.privateKey,
    address: wallet.address,
  };
}

async function initHardhat(dir: string) {
  const startingDir = process.cwd();
  process.chdir(dir);
  try {
    const hardhat = (await (async () => {
      if (require) return require("hardhat");
      else return (await import("hardhat")).default;
    })()) as typeof import("hardhat") & {
      taskNames: typeof import("hardhat/builtin-tasks/task-names");
    };
    hardhat.taskNames = (await (async () => {
      if (require) return require("hardhat/builtin-tasks/task-names");
      else return await import("hardhat/builtin-tasks/task-names");
    })()) as typeof import("hardhat/builtin-tasks/task-names");
    process.chdir(startingDir);
    return hardhat as typeof hardhat & {
      ethers: import("@nomicfoundation/hardhat-ethers/types").HardhatEthersHelpers;
    };
  } catch (e) {
    process.chdir(startingDir);
    throw e;
  }
}

export async function deployContract<const ABI extends any[] = []>({
  contractAbi,
  contractName,
  args,
}: {
  contractAbi: ABI;
  contractName: string;
  args: any[];
}) {
  blockchainLogger(
    `Deploying contract ${contractName} with ${args.length} parameters ${args
      .map((a) => `${a} (${Array.isArray(a) ? "array" : typeof a})`)
      .join(", ")}`
  );
  try {
    if (!instance?.rootFolder)
      throw new Error(
        `You are trying to deploy a contract without defining the Blockchain Project folder. Please define it at startBlockchain command.`
      );
    const getContract = async () => {
      const { default: Web3 } = await import("web3");
      const web3 = new Web3(
        new Web3.providers.HttpProvider(
          `http://${"127.0.0.1"}:${instance.port}`
        )
      );
      return new web3.eth.Contract(
        contractAbi,
        await lock.getAddress()
      ) as GenericContract<ABI>;
    };
    const { ethers } = await initHardhat(instance!.rootFolder);
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory(contractName);

    const lock = await Factory.deploy();
    await lock.waitForDeployment();

    if (args.length > 0) {
      blockchainLogger(
        `Initializing contract with owner ${owner} and args ${args}`
      );
      const connection = lock.connect(owner);
      let initializationKey = "initialize";
      connection.interface.forEachFunction((func) => {
        const funcName = func.name;
        if (
          funcName.split(",", args.length) &&
          funcName.startsWith("initialize(")
        )
          initializationKey = funcName;
      });
      if (connection[initializationKey]) {
        /**
         * The way to decide which overloaded function to call is to pass overrides at the end 🤡
         * https://github.com/ethers-io/ethers.js/issues/4383
         */
        await connection[initializationKey](...args, Typed.overrides({}));
      }
      return {
        address: await lock.getAddress(),
        owner: await owner.getAddress(),
        contract: await getContract(),
      };
    } else {
      return {
        address: await lock.getAddress(),
        owner: await owner.getAddress(),
        contract: await getContract(),
      };
    }
  } catch (e) {
    blockchainLogger(`Something has gone wrong`, e);
    throw e;
  }
}

/**
 * Takes a graph and deploys it into the graph-node
 */
export async function deployGraph(
  graphPath: string,
  contractAddresses: {
    [deployedContractName: string]: string;
  },
  graphName: string,
  networkName: string
) {
  const { parse, stringify } = await import("yaml");
  const { default: cacheDir } = await import("find-cache-dir");
  const graphManifestCacheDir = cacheDir({
    name: `graph-manifest`,
    cwd: graphPath,
  });
  const currentBlock = await instance.process.ethers.provider.getBlockNumber();

  function generateGraphManifest() {
    const subgraphYml = parse(
      readFileSync(resolve(graphPath, "subgraph.yaml")).toString()
    ) as {
      schema: {
        file: string;
      };
      dataSources: {
        source: {
          abi: string;
          address: string;
          startBlock: number;
        };
        network: string;
        mapping: {
          file: string;
          abis: { file: string }[];
        };
      }[];
    };
    function relativeToAbsolutePath(relativePath: string) {
      return resolve(graphPath, relativePath);
    }
    subgraphYml.schema.file = relativeToAbsolutePath(subgraphYml.schema.file);
    for (let dataSource of subgraphYml.dataSources) {
      /** If we don't have the address for said source, we remove the source from the deployed graph */
      if (!contractAddresses[dataSource.source.abi]) {
        blockchainLogger(
          `Address for the contract "${dataSource.source.abi}" wasn't provided. Removing this data source from graph.`
        );
        subgraphYml.dataSources[subgraphYml.dataSources.indexOf(dataSource)] =
          undefined;
        continue;
      }
      dataSource.network = networkName;
      dataSource.source.address = contractAddresses[dataSource.source.abi];
      if (instance.process.config.networks.hardhat.forking)
        dataSource.source.startBlock = currentBlock;
      dataSource.mapping.file = relativeToAbsolutePath(dataSource.mapping.file);
      for (let abi of dataSource.mapping.abis)
        abi.file = relativeToAbsolutePath(abi.file);
    }
    subgraphYml.dataSources = subgraphYml.dataSources.filter(Boolean);
    const graphManifestPath = resolve(graphManifestCacheDir, `subgraph.yaml`);
    if (!existsSync(graphManifestCacheDir))
      mkdirSync(graphManifestCacheDir, { recursive: true });
    writeFileSync(graphManifestPath, stringify(subgraphYml));
    return graphManifestPath;
  }
  const stdioMode = blockchainLogger.enabled ? "inherit" : "ignore";
  while (true) {
    try {
      blockchainLogger("Trying to create graph");
      execSync(`graph create --node http://localhost:8020/ ${graphName}`, {
        cwd: graphPath,
        stdio: stdioMode,
        env: {
          PATH: process.env.PATH,
        },
      });
      break;
    } catch (error) {
      await wait(1000);
    }
  }

  const localhostGraphManifest = generateGraphManifest();
  blockchainLogger("Trying to deploy graph");
  await new Promise<void>((res, rej) => {
    exec(
      `graph deploy --node http://localhost:8020/ --ipfs http://localhost:5031 ${graphName} ${localhostGraphManifest} -l v0.0.1`,
      {
        cwd: graphPath,
        env: {
          PATH: `${process.env.PATH}`,
        },
      },
      (error, stdOut) => {
        console.log(stdOut);
        if (error) {
          rej(error);
        }
        res();
      }
    );
  });

  await wait(1000);
}

export async function stopBlockchain() {
  blockchainLogger(
    "Closing blockchain infrastructure.",
    "Has blockchain instance:",
    String(!!instance)
  );
  if (instance) {
    try {
      blockchainLogger("Closing hardhat server");
      if (instance.graphqlProject) {
        blockchainLogger("Ending graphql docker container");
        execSync("docker compose down", {
          cwd: instance.graphqlProject,
          stdio: "ignore",
        });
      }
      await instance.hardhatServer.close();
    } catch (e) {}
    instance = null;
  }
}
