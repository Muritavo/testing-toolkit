import { resolve } from "path";
import { startBlockchain } from "../src/native/blockchain";
import Web3 from "web3";
import { ZERO_X_ABI } from "./fixtures/zero_x_abi";

it("Should be able to spin up blockchain server forking a preexisting network", async () => {
  await startBlockchain({
    projectRootFolder: resolve(__dirname),
    port: 19000
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
    ZERO_X_ABI,
    "0xdef1c0ded9bec7f1a1670819833240f027b25eff"
  );

  console.log(await c.methods.getTransformWallet().call());
});
