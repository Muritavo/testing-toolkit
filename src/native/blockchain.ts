import debug from "debug";
import GenericContract from "../types/contract";
import { setPort } from "../client/blockchain";
import { execSync } from "child_process";
import { wait } from "../utility";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

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
    if (prevFork)
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

    return instance.addresses;
  }
  if (projectFolder)
    blockchainLogger(`Starting blockchain server at "${projectFolder}"`);
  if (graphqlProject)
    execSync("docker-compose up --detach", {
      cwd: graphqlProject,
      stdio: "ignore",
    });
  /**
   * This will start a hardhat node
   */
  const serverInstance = await initHardhat(projectFolder);
  await new Promise<void>((r, rej) => {
    const timeoutId = setTimeout(() => {
      rej(new Error(`Something went wrong while starting hardhat node`));
    }, 30000);
    serverInstance.tasks[
      serverInstance.taskNames.TASK_NODE_SERVER_READY
    ].setAction(async () => {
      clearTimeout(timeoutId);
      r();
    });
    serverInstance.run("node", {
      port,
    });
  });
  const accounts = new Array(
    (serverInstance.config.networks.hardhat.accounts as any).count
  )
    .fill(undefined)
    .reduce((res, _, idx) => {
      const account = deployer(idx, serverInstance);
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
  };
  setPort(port);
  return accounts;
}

function deployer(index: number = 0, hardhat: any) {
  const ethers = hardhat.ethers;
  const accounts = hardhat.config.networks.hardhat.accounts;
  const wallet = ethers.Wallet.fromPhrase(
    accounts.mnemonic,
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
        await connection[initializationKey](...args);
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
  }
) {
  const { parse, stringify } = await import("yaml");
  const { default: cacheDir } = await import("find-cache-dir");
  function generateGraphManifest() {
    const graphManifestCacheDir = cacheDir({ name: `graph-manifest` });
    const subgraphYml = parse(
      readFileSync(resolve(graphPath, "subgraph.yaml")).toString()
    );
    function relativeToAbsolutePath(relativePath: string) {
      return resolve(graphPath, relativePath);
    }
    subgraphYml.schema.file = relativeToAbsolutePath(subgraphYml.schema.file);
    for (let dataSource of subgraphYml.dataSources) {
      dataSource.network = "localhost";
      if (!contractAddresses[dataSource.source.abi])
        throw new Error(
          `Please, provide the address for the contract "${dataSource.source.abi}" deployed on the local hardhat node`
        );
      dataSource.source.address = contractAddresses[dataSource.source.abi];
      dataSource.mapping.file = relativeToAbsolutePath(dataSource.mapping.file);
      for (let abi of dataSource.mapping.abis)
        abi.file = relativeToAbsolutePath(abi.file);
    }
    const graphManifestPath = resolve(graphManifestCacheDir, `subgraph.yaml`);
    if (!existsSync(graphManifestCacheDir))
      mkdirSync(graphManifestCacheDir, { recursive: true });
    writeFileSync(graphManifestPath, stringify(subgraphYml));
    return graphManifestPath;
  }
  const stdioMode = blockchainLogger.enabled ? undefined : "ignore";
  while (true) {
    try {
      execSync("yarn create-local", {
        cwd: graphPath,
        stdio: stdioMode,
      });
      break;
    } catch (error) {
      await wait(1000);
    }
  }

  const localhostGraphManifest = generateGraphManifest();
  execSync(`yarn deploy-local ${localhostGraphManifest} -l v0.0.1`, {
    cwd: graphPath,
    stdio: stdioMode,
  });

  await wait(1000);
}
