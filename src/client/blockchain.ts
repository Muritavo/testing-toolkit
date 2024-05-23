import GenericContract, { MapTypeToJS } from "../types/contract";
import Web3 from "web3";

let port: number;
/**
 * For future me: This is needed because when using
 * on cypress-toolkit "startblockchain" and "invokecontract"
 * are run in different contexts, so the port variable cannot be
 * shared.
 */
export function setPort(_port: number) {
  port = _port;
}

function _getPort() {
  if (!port)
    throw new Error(
      `Please, indicate the port that the blockchain node is running (by default it runs on 8545) 
using the setPort from "@muritavo/testing-toolkit/dist/client/blockchain"`
    );
  return port;
}

/// @ts-expect-error
export async function invokeContract<C, M extends keyof C["methods"]>(
  wallet: string,
  _contract: C,
  contractMethodName: M,
  /// @ts-expect-error
  ...params: Parameters<C["methods"][M]>
): Promise<
  C extends GenericContract<infer ABI>
    ? // If the ABI method is of state view
      (ABI[number] & { name: M })["stateMutability"] extends "view"
      ? // Returns the output type
        MapTypeToJS<(ABI[number] & { name: M })["outputs"][0]["type"], []>
      : // Or else, keep the old return
        never
    : // It should never fall here
      never
> {
  const contract = _contract as GenericContract<any[]>;
  const abiDefinition = (contract as any)._jsonInterface.find(
    (a: any) => a.name === contractMethodName
  );
  const state = abiDefinition.stateMutability;

  if (state === "view")
    return new Promise((r, rej) => {
      (contract.methods[contractMethodName as string] as any)(...params)
        .call()
        .then((result: any) => r(result))
        .catch((e) => rej(e));
    });

  const call: any = (contract.methods[contractMethodName as string] as any)(
    /// @ts-ignore
    ...(params as any)
  ).send({
    from: wallet,
    gas: 90000000,
    gasPrice: "90000000000",
  });
  const web3 = new Web3(
    new Web3.providers.HttpProvider(`http://${"127.0.0.1"}:${_getPort()}`)
  );
  return new Promise<void>(async (r, rej) => {
    try {
      const txHash = await new Promise<string>((r, rej) => {
        call.on("transactionHash", (tX: string) => {
          r(tX);
        });
        call.catch((e) => {
          rej(e);
        });
      });
      while (true) {
        const transaction = await web3.eth.getTransactionReceipt(txHash);

        const isMined =
          !transaction ||
          !transaction.blockHash ||
          transaction.status === undefined
            ? undefined // I still don't know if it's loaded
            : !!transaction.status === true;
        if (isMined === undefined) {
          await new Promise<void>((r) => setTimeout(() => r(), 1000));
        } else {
          if (isMined) {
            r();
          } else {
            rej(new Error(`Transaction failed, check the logs`));
          }
          break;
        }
      }
    } catch (e) {
      rej(e);
    }
  }) as any;
}
