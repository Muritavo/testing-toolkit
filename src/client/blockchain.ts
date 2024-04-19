import GenericContract, { MapTypeToJS } from "../types/contract";
import Web3 from "web3";

/** @internal */
type ArrayExceptFirst<F> = F extends [arg0: any, ...rest: infer R] ? R : never;

/** @internal */
type TupleToFunctionTuple<
  A,
  T,
  /// @ts-expect-error
  F = T[0],
  N = [F] extends [undefined] ? true : false
> = true extends N ? [] : [F, ...TupleToFunctionTuple<A, ArrayExceptFirst<T>>];

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
    new Web3.providers.WebsocketProvider(`ws://${"127.0.0.1"}:${8545}`)
  );
  return new Promise<void>(async (r, rej) => {
    const txHash = await new Promise<string>((r, rej) => {
      call.on("transactionHash", (tX: string) => {
        r(tX);
      });
      call.catch(rej);
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
        if (isMined) r();
        else rej(new Error(`Transaction failed, check the logs`));
        break;
      }
    }
  }) as any;
}
