import debug from "debug";
import { TASK_NODE_SERVER_READY } from "hardhat/builtin-tasks/task-names";
import { FormatTypes } from "@ethersproject/abi";
import GenericContract from "../types/contract";
const logger = debug("@muritavo/testing-toolkit/blockchain");

// This register the tasks for deploying a hardhat blockchain
type Addresses = { [wallet: string]: { secretKey: string } };
let instance: {
  process: typeof import("hardhat") & {
    ethers: import("@nomiclabs/hardhat-ethers/types").HardhatEthersHelpers;
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
}: {
  /** The NFT projects root folder so the contracts can be deployed from */
  projectRootFolder: string;
  /**
   * This indicates the port the ganache server will run at
   * @default 8545
   * */
  port?: number;
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
  if (projectFolder) logger(`Starting blockchain server at "${projectFolder}"`);
  /**
   * This will start a hardhat node
   */
  const serverInstance = await initHardhat(projectFolder);
  await new Promise<void>((r, rej) => {
    const timeoutId = setTimeout(() => {
      rej(new Error(`Something went wrong while starting hardhat node`));
    }, 30000);
    serverInstance.tasks[TASK_NODE_SERVER_READY].setAction(async () => {
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
  return accounts;
}

function deployer(index: number = 0, hardhat: any) {
  const ethers = hardhat.ethers;
  const accounts = hardhat.config.networks.hardhat.accounts;
  const wallet = ethers.Wallet.fromMnemonic(
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
      try {
        return require("hardhat");
      } catch (e) {
        console.log(
          "Requiring hardhat failed... Trying using import... Check the error below\n",
          e
        );
        return (await import("hardhat")).default;
      }
    })()) as typeof import("hardhat");
    process.chdir(startingDir);
    return hardhat as typeof hardhat & {
      ethers: import("@nomiclabs/hardhat-ethers/types").HardhatEthersHelpers;
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
  logger(
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
        lock.address
      ) as GenericContract<ABI>;
    };
    const { ethers } = await initHardhat(instance!.rootFolder);
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory(contractName);

    const lock = await Factory.deploy();
    await lock.deployed();

    if (args.length > 0) {
      logger(`Initializing contract with owner ${owner} and args ${args}`);
      const connection = lock.connect(owner);
      const initializationKey =
        Object.keys(connection.functions).find(
          (a) => a.split(",", args.length) && a.startsWith("initialize(")
        ) || "initialize";
      if (connection[initializationKey]) {
        await connection[initializationKey](...args);
      }
      return {
        address: lock.address,
        owner: owner.address,
        contract: await getContract(),
      };
    } else {
      return {
        address: lock.address,
        owner: owner.address,
        contract: await getContract(),
      };
    }
  } catch (e) {
    logger(`Something has gone wrong`, e);
    throw e;
  }
}
