import { server } from "ganache";
const logger = require("debug")("cypress-toolkit/blockchain");

type Addresses = {
  [address: string]: {
    balance: number;
    unlocked: number;
    secretKey: string;
  };
};

let instance: {
  process: ReturnType<typeof server>;
  rootFolder: string;
  contracts: {
    [id: string]: {
      address: string;
    };
  };
  addresses: Addresses;
} | null;

export async function startBlockchainNode(nftContractsProjectFolder: string) {
  if (instance) {
    return instance.addresses;
  }
  logger(`Starting blockchain server at "${nftContractsProjectFolder}"`);
  /**
   * This will start a hardhat node
   */
  const serverInstance = server({
    gasLimit: 99000000000000,
    wallet: {
        deterministic: true
    }
  });
  const accounts = await serverInstance.listen(15000).then(() => {
    return Object.entries(serverInstance.provider.getInitialAccounts()).reduce(
      (r, [k, v]) => ({
        ...r,
        [k]: {
          ...v,
          balance: Number(v.balance),
          unlocked: Number(v.unlocked),
        },
      }),
      {} as Addresses
    );
  });
  instance = {
    process: serverInstance,
    rootFolder: nftContractsProjectFolder,
    contracts: {},
    addresses: accounts,
  };
  return accounts;
}

export async function deployContract(
  contractName: string,
  ...initializationArgs: any[]
) {
  if (instance!.contracts[contractName]) {
    return instance!.contracts[contractName];
  } else {
    logger(
      `Deploying contract ${contractName} with parameters ${initializationArgs}`
    );
    const startingDir = process.cwd();
    process.chdir(instance!.rootFolder);
    const hardhat = require("hardhat") as typeof import("hardhat");
    hardhat.network.provider = instance!.process.provider as any;
    process.chdir(startingDir);
    const { ethers } = hardhat as any;
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory(contractName);
    const lock = await Factory.deploy();
    await lock.deployed();

    if (initializationArgs.length > 0) {
      logger(
        `Initializing contract with owner ${owner} and args ${initializationArgs}`
      );
      const connection = lock.connect(owner);
      const initializationKey =
        Object.keys(connection.functions).find(
          (a) =>
            a.split(",", initializationArgs.length) &&
            a.startsWith("initialize(")
        ) || "initialize";
      if (connection[initializationKey])
        await connection[initializationKey](...initializationArgs);
    }
    return {
      address: lock.address,
      owner: owner.address,
    };
  }
}
