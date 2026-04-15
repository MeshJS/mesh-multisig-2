import { CrowdFundScript } from "@/utils/scripts";
import { IEvaluator, IFetcher, ISubmitter, MeshTxBuilder } from "@meshsdk/core";
import { Address, HexBlob } from "@meshsdk/core-cst";
import { MeshCardanoHeadlessWallet } from "@meshsdk/wallet";

export const createScriptRef = async (
  wallet: MeshCardanoHeadlessWallet,
  fetcher: IFetcher,
  evaluator: IEvaluator,
  submitter: ISubmitter,
) => {
  const walletAddress = await wallet.getChangeAddressBech32();
  const utxos = await wallet.getUtxosMesh();
  const initialTxHash = utxos[0]?.input.txHash;
  const initialTxIndex = utxos[0]?.input.outputIndex;

  if (initialTxHash === undefined || initialTxIndex === undefined) {
    throw new Error("Wallet UTxO not found");
  }

  const addressBech32 = (await wallet.getUsedAddresses())[0];
  if (!addressBech32) {
    throw new Error("Wallet address not found");
  }

  const address = Address.fromBytes(HexBlob(addressBech32));
  const paymentKeyHash = address.getProps().paymentPart?.hash;
  if (!paymentKeyHash) {
    throw new Error("Wallet address does not have a payment key hash");
  }

  const scripts = new CrowdFundScript(initialTxHash, initialTxIndex);
  const crowdfundScript = scripts.crowdfundScript();

  const txBuilder = new MeshTxBuilder({
    fetcher,
    evaluator,
  });

  const txHex = await txBuilder
    .selectUtxosFrom(utxos)
    .txIn(initialTxHash, initialTxIndex)
    .txOut(crowdfundScript.address, [])
    .txOutReferenceScript(crowdfundScript.cbor)
    .txInCollateral(initialTxHash, initialTxIndex)
    .changeAddress(walletAddress)
    .complete();

  const signedTx = await wallet.signTxReturnFullTx(txHex);

  let txHash: string;
  try {
    txHash = await submitter.submitTx(signedTx);
  } catch (e) {
    console.error("Failed to submit script ref transaction:", e);
    throw e;
  }

  localStorage.setItem("scriptRef", txHash);

  return txHash;
};
