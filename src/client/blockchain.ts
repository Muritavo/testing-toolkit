import GenericContract from "../types/contract";
import Web3 from "web3";

export async function invokeContract<
  C extends GenericContract<any>,
  M extends keyof C["methods"]
>(
  wallet: string,
  contract: C,
  contractMethodName: M,
  ...params: Parameters<C["methods"][M]>
) {
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
    ...params
  ).send({
    from: wallet,
    gas: 90000000,
    gasPrice: "90000000000",
  });
  const web3 = new Web3(`ws://${"127.0.0.1"}:${8545}`);
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
