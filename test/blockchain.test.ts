import { resolve } from "path";
import {
  deployContract,
  deployGraph,
  deriveWallet,
  startBlockchain,
  stopBlockchain,
} from "../src/native/blockchain";
import { invokeContract, setPort } from "../src/client/blockchain";
import { ApolloClient, InMemoryCache, gql } from "@apollo/client";
import killPort from "kill-port";

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
  beforeEach(async () => {
    await cleanPreviousNodes();
  });
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

  afterEach(() => {
    cleanPreviousNodes();
  });
});

it("Should be able to spin up blockchain server forking a preexisting network", async () => {
  setPort(19000);
  const wallets = await startBlockchain({
    projectRootFolder: resolve(__dirname, ".."),
    port: 19000,
  });
  const { address, contract } = await deployTestContract();
  await invokeContract(Object.keys(wallets)[0], contract, "echo", "0x9").then(
    (r) => console.log("Invoke return", r)
  );
  for (let idx of [0, 1])
    await invokeContract(
      Object.keys(wallets)[idx],
      contract,
      "echoSend",
      "0x9"
    ).then((r) => console.log("Invoke return", r));
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
    });
  });
  it.only("Should be able to close the docker compose", async () => {
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
    });
  });
  afterEach(async () => {
    await stopBlockchain();
    await wait(5);
  });
});

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
// undefined;

async function cleanPreviousNodes() {
  // execSync("yarn graph-local-clean", {
  //   cwd: resolve(__dirname, ".."),
  //   stdio: log,
  // });
  // try {
  //   await killPort(19008);
  // } catch (error) {}
}

async function wait(sec: number) {
  return await new Promise((r) => {
    setTimeout(() => {
      r(null);
    }, 1000 * sec);
  });
}
