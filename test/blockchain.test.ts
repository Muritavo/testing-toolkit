import { resolve } from "path";
import { deployContract, startBlockchain } from "../src/native/blockchain";
import { ZERO_X_ABI } from "./fixtures/zero_x_abi";
import { invokeContract } from "../src/client/blockchain";
import GenericContract from "../src/types/contract";

jest.mock("web3", () => require("web3v4"));

it("Should be able to spin up blockchain server forking a preexisting network", async () => {
  const mod = await import("web3");
  const { default: Web3 } = mod;
  const wallets = await startBlockchain({
    projectRootFolder: resolve(__dirname),
    port: 19000,
  });
  const { address, contract } = await deployContract<
    [
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
        stateMutability: "nonpayable";
        type: "function";
      }
    ]
  >({ contractName: "SimpleContract", args: [] });

  await invokeContract(Object.keys(wallets)[0], contract, "echo", "9").then(
    (r) => console.log("Invoke return", r)
  );
});
