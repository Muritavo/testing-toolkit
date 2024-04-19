import { resolve } from "path";
import { startBlockchain } from "../src/native/blockchain";
import { ZERO_X_ABI } from "./fixtures/zero_x_abi";
import { invokeContract } from "../src/client/blockchain";
import GenericContract from "../src/types/contract";

jest.mock("web3", () => require("web3v4"));

it("Should be able to spin up blockchain server forking a preexisting network", async () => {
  const mod = await import("web3");
  const { default: Web3 } = mod;
  await startBlockchain({
    projectRootFolder: resolve(__dirname),
    port: 19000,
  });

  const p = new Web3.providers.HttpProvider("http://127.0.0.1:19000");
  p.send(
    { method: "eth_chainId", jsonrpc: "2.0", id: 1, params: [] },
    (e, r) => {
      console.log("Response", e, r);
    }
  );
  const w = new Web3(p);
  const c = new w.eth.Contract(
    ZERO_X_ABI as any,
    "0xdef1c0ded9bec7f1a1670819833240f027b25eff"
  ) as GenericContract<typeof ZERO_X_ABI>;
  c.methods.getTransformWallet().call();
  await invokeContract("s", c, "getTransformWallet").then((r) =>
    console.log("Invoke return", r)
  );
});
