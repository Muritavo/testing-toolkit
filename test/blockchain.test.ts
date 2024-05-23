import { resolve } from "path";
import {
  blockchainLogger,
  deployContract,
  deployGraph,
  startBlockchain,
} from "../src/native/blockchain";
import { invokeContract, setPort } from "../src/client/blockchain";
import { parse, stringify } from "yaml";
import { readFileSync, writeFileSync } from "fs";
import { ApolloClient, InMemoryCache, gql } from "@apollo/client";
import { execSync } from "child_process";
import killPort from "kill-port";
import debug from "debug";

jest.mock("web3", () => require("web3v4"));

const log = "ignore";
// undefined;

async function cleanPreviousNodes() {
  execSync("yarn graph-local-clean", {
    cwd: resolve(__dirname, ".."),
    stdio: log,
  });
  try {
    await killPort(19008);
  } catch (error) {}
}

async function wait(sec: number) {
  return await new Promise((r) => {
    setTimeout(() => {
      r(null);
    }, 1000 * sec);
  });
}

describe("GraphQL", () => {
  beforeEach(async () => {
    await cleanPreviousNodes();
  });
  it.only("Should be able to deploy a graph to local node", async () => {
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
      const dynamicGraphName = "testing-toolkit-random";
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

    await deployGraph(resolve(__dirname, "graphs", "simple-graph"), contracts);

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
  await invokeContract(
    Object.keys(wallets)[0],
    contract,
    "echoSend",
    "0x9"
  ).then((r) => console.log("Invoke return", r));
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
