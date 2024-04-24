import { resolve } from "path";
import { deployContract, startBlockchain } from "../src/native/blockchain";
import { invokeContract, setPort } from "../src/client/blockchain";

jest.mock("web3", () => require("web3v4"));

it("Should be able to spin up blockchain server forking a preexisting network", async () => {
  setPort(19000);
  const wallets = await startBlockchain({
    projectRootFolder: resolve(__dirname, ".."),
    port: 19000,
  });
  const { address, contract } = await deployContract({
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

  await invokeContract(Object.keys(wallets)[0], contract, "echo", "0x9").then(
    (r) => console.log("Invoke return", r)
  );
  await invokeContract(Object.keys(wallets)[0], contract, "echoSend", "0x9").then(
    (r) => console.log("Invoke return", r)
  );
});
