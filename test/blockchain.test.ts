import { resolve } from "path";
import {
  Addresses,
  bindToBlockchain,
  blockchainLogger,
  deployContract,
  deployGraph,
  deriveWallet,
  impersonateAccount,
  startBlockchain,
  stopBlockchain,
} from "../src/native/blockchain";
import { invokeContract, setPort } from "../src/client/blockchain";
import { ApolloClient, InMemoryCache, gql } from "@apollo/client";
import { ChildProcess, spawn, spawnSync } from "child_process";
import GenericContract from "../src/types/contract";

describe("Wallet", () => {
  it("Should be able to derive wallets", async () => {
    deriveWallet(0, {
      ethers: await import("ethers"),
      config: {
        networks: {
          hardhat: {
            accounts: {
              path: "m/44'/60'/0'/0",
              mnemonic:
                "test test test test test test test test test test test junk",
            },
          },
        },
      },
    });
  });
});

describe("GraphQL", () => {
  it("Should be able to deploy a graph to local node", async () => {
    const THIS_TEST_GRAPH_NAME =
      // = `test-graph-${(
      //   Math.random() * 1000000
      // ).toFixed(0)}`;
      "testing-toolkit-random22";
    async function setupBlockchainNode() {
      const wallets = await startBlockchain({
        projectRootFolder: resolve(__dirname, ".."),
        port: 19008,
        graphqlProject: resolve(__dirname, ".."),
        deployTags: [],
      });
      const { address, contract } = await deployTestContract();

      return {
        contract,
        wallet: Object.keys(wallets)[0],
        contracts: {
          SimpleContract: address,
        },
      };
    }
    async function executeTestQuery() {
      await new Promise((r) => {
        setTimeout(() => {
          r(null);
        }, 3000);
      });
      const dynamicGraphName = THIS_TEST_GRAPH_NAME;
      const qlClient = new ApolloClient({
        cache: new InMemoryCache(),
        uri: `http://0.0.0.0:8000/subgraphs/name/${dynamicGraphName}`,
      });

      const data = await qlClient.query({
        query: gql`
          query {
            exampleEntities {
              testMsg
              count
            }
          }
        `,
      });

      console.log(JSON.stringify(data.data));

      return data;
    }
    const { contract, wallet, contracts } = await setupBlockchainNode();

    await invokeContract(wallet, contract, "echoSend", "0x9");
    await wait(5);

    // await wait(2000);
    /** It seems this test is failing to deploy because the hardhat is getting stuck because of execSync */
    await deployGraph(
      resolve(__dirname, "graphs", "simple-graph"),
      contracts,
      THIS_TEST_GRAPH_NAME,
      "localhost"
    );

    await executeTestQuery();

    await invokeContract(wallet, contract, "echoSend", "0x9");
    await wait(5);
    await executeTestQuery();

    await invokeContract(wallet, contract, "echoSend", "0x9");
    await wait(5);
    await executeTestQuery();
  });
});

function blockchainConfigFactory(foldeR: string) {
  return {
    projectFolder: resolve(__dirname, "hardhat-configs", foldeR),
    hardhatConfigImportPromiseFactory: () =>
      import(`./hardhat-configs/${foldeR}/hardhat.config`).then(
        (m) => m.default
      ),
    port: 8545,
    deployTags: undefined,
  };
}
async function testContractDeployment(
  wallets: Addresses,
  testWithWallet: string = Object.keys(wallets)[0]
) {
  const { address, contract, owner } = await deployTestContract();
  const addresses = Object.keys(wallets);
  for (let wallet of [testWithWallet, addresses[1]])
    await invokeContract(wallet, contract, "echo", "0x9").then((r) =>
      console.log("Invoke return", r)
    );
  for (let wallet of [testWithWallet, addresses[1]])
    await invokeContract(wallet, contract, "echoSend", "0x9").then((r) =>
      console.log("Invoke return to wallet " + wallet, r)
    );
}

it("Should be able to spin up blockchain server forking a preexisting network", async () => {
  setPort(19000);
  const wallets = await startBlockchain({
    projectRootFolder: resolve(__dirname, ".."),
    port: 19000,
    deployTags: [],
  });
  await testContractDeployment(wallets);
});
describe("Improvement", () => {
  it("Should not complain about blockchain node running after test ends", async () => {
    await startBlockchain({
      projectRootFolder: resolve(
        __dirname,
        "hardhat-configs",
        "simple-hardhat"
      ),
      port: 19001,
      deployTags: [],
    });
  });
  it("Should be able to close the docker compose", async () => {
    await startBlockchain({
      projectRootFolder: resolve(
        __dirname,
        "hardhat-configs",
        "hardhat-with-graphql"
      ),
      graphqlProject: resolve(
        __dirname,
        "hardhat-configs",
        "hardhat-with-graphql"
      ),
      port: 19001,
      deployTags: [],
    });
  });
  it("Should bind to running blockchain node", async () => {
    const blockchainConfig = blockchainConfigFactory("hardhat-with-graphql");
    blockchainLogger.enabled = true;
    setPort(8545);
    const wallets = await bindToBlockchain(blockchainConfig);
    await testContractDeployment(wallets);
    await bindToBlockchain(blockchainConfig);
  });
  it("Should be able to impersonate account", async () => {
    startUnattachedNode("simple-hardhat", false);
    setPort(8545);
    await wait(2);
    const wallets = await bindToBlockchain(
      blockchainConfigFactory("simple-hardhat")
    );
    await impersonateAccount("0x43F118A1581F00dFE90FEFE0f1e01a465d6E9Fa0");
    await testContractDeployment(
      wallets,
      "0x43F118A1581F00dFE90FEFE0f1e01a465d6E9Fa0"
    );
  });
  it("Should be able to run deploy task", async () => {
    blockchainLogger.enabled = true;
    const callAutoDeployedContract = async () =>
      (await getAnotherContract()).methods
        .echo("123")
        .call()
        .then((c) => console.log(c));
    startUnattachedNode("hardhat-with-deploy", true);
    await wait(2);
    await bindToBlockchain(blockchainConfigFactory("hardhat-with-deploy"));
    setPort(8545);
    await callAutoDeployedContract();
    await wait(2);
    await bindToBlockchain(blockchainConfigFactory("hardhat-with-deploy"));
    await wait(2);
    await callAutoDeployedContract();
    await wait(2);
  });
  it.only("Should be able to reset to another block", async () => {
    blockchainLogger.enabled = true
    await startBlockchain({
      projectRootFolder: resolve(
        __dirname,
        "hardhat-configs",
        "hardhat-with-deploy"
      ),
      port: 8545,
      deployTags: [],
    });
    await wait(2);
    const provider = await getProvider();
    const blockNumberBeforeRestart = await provider.eth.getBlockNumber();
    console.log("before", blockNumberBeforeRestart);
    await wait(2);
    console.log("After a few seconds", await provider.eth.getBlockNumber());
    await startBlockchain({
      projectRootFolder: resolve(
        __dirname,
        "hardhat-configs",
        "hardhat-with-deploy"
      ),
      port: 8545,
      deployTags: [],
      forkToNumber: 6000000,
    });
    await wait(2);
    console.log("After reset", await provider.eth.getBlockNumber());
  });
  afterEach(async () => {
    if (spawned) spawned.kill();
    await stopBlockchain();
    // await wait(5);
  });
});

const getProvider = async () => {
  const { default: Web3 } = await import("web3");
  return new Web3(
    new Web3.providers.HttpProvider(`http://${"127.0.0.1"}:${8545}`)
  );
};

const getAnotherContract = async () => {
  const web3 = await getProvider();
  return new web3.eth.Contract(
    require("./hardhat-configs/hardhat-with-deploy/artifacts/contracts/AnotherContract.sol/AnotherContract.json").abi,
    "0x32B7F224C961b1335b7b413777399B81F8AF4905"
  ) as GenericContract<
    [
      {
        anonymous: false;
        inputs: [
          {
            indexed: false;
            internalType: "string";
            name: "ExampleMsg";
            type: "string";
          }
        ];
        name: "ExampleEvent";
        type: "event";
      },
      {
        inputs: [
          {
            internalType: "uint256";
            name: "_value";
            type: "uint256";
          }
        ];
        name: "echo";
        outputs: [
          {
            internalType: "uint256";
            name: "";
            type: "uint256";
          }
        ];
        stateMutability: "view";
        type: "function";
      },
      {
        inputs: [
          {
            internalType: "uint256";
            name: "_value";
            type: "uint256";
          }
        ];
        name: "echoSend";
        outputs: [];
        stateMutability: "nonpayable";
        type: "function";
      }
    ]
  >;
};

let spawned: ChildProcess;
function startUnattachedNode(folder: string, withTags: boolean) {
  const p = resolve(`./test/hardhat-configs/${folder}`);
  spawned = spawn(
    `yarn hardhat --config ${p}/hardhat.config.ts --network hardhat node${
      withTags ? " --tags example-tag" : ""
    }`,
    {
      cwd: p,
      stdio: "inherit",
      env: process.env,
      shell: true,
    }
  );
}

async function deployTestContract() {
  return await deployContract({
    contractAbi: [
      {
        inputs: [
          {
            internalType: "uint256",
            name: "_value",
            type: "uint256",
          },
        ],
        name: "echo",
        outputs: [
          {
            internalType: "uint256",
            name: "",
            type: "uint256",
          },
        ],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [
          {
            internalType: "uint256",
            name: "_value",
            type: "uint256",
          },
        ],
        name: "echoSend",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
    ],
    contractName: "SimpleContract",
    args: [],
  });
}

jest.mock("web3", () => require("web3v4"));

const log = "ignore";

async function wait(sec: number) {
  return await new Promise((r) => {
    setTimeout(() => {
      r(null);
    }, 1000 * sec);
  });
}
