import { totalDeposit } from "@/tests/test-utils";
import { CrowdfundGovDatum } from "@/types/gcf-spend";
import {
  conStr0,
  conStr1,
  IEvaluator,
  IFetcher,
  ISubmitter,
  MeshTxBuilder,
  MeshValue,
  PubKeyAddress,
  ScriptAddress,
  UTxO,
} from "@meshsdk/core";
import { fromPlutusDataToJson, PlutusData } from "@meshsdk/core-cst";
import { MeshCardanoHeadlessWallet } from "@meshsdk/wallet";

export type ProposalInfo = {
  utxo: UTxO;
  fundedAmount: bigint;
  deadline: bigint;
  scripts: {
    authToken: {
      hash: string;
      cbor: string;
    };
    crowdfund: {
      hash: string;
      cbor: string;
    };
    crowdfundStake: {
      hash: string;
      cbor: string;
    };
    shareToken: {
      hash: string;
      cbor: string;
    };
  };
};

export const contributeProposal = async (
  wallet: MeshCardanoHeadlessWallet,
  fetcher: IFetcher,
  evaluator: IEvaluator,
  submitter: ISubmitter,
  proposalInfo: ProposalInfo,
  contributeAmount: number,
) => {
  const latestBlock = await fetcher.get("/blocks/latest");
  const previousDatum: CrowdfundGovDatum = fromPlutusDataToJson(
    PlutusData.fromCbor(proposalInfo.utxo.output.plutusData),
  ) as CrowdfundGovDatum;
  const newDatum: CrowdfundGovDatum = conStr0([
    previousDatum.fields[0],
    previousDatum.fields[1],
    previousDatum.fields[2],
    previousDatum.fields[3],
    {
      int: (
        BigInt(previousDatum.fields[4]?.int ?? 0) + BigInt(contributeAmount)
      ).toString(),
    },
    previousDatum.fields[5],
    previousDatum.fields[6],
    previousDatum.fields[7],
    previousDatum.fields[8],
  ]) as unknown as CrowdfundGovDatum;

  const txBuilder = new MeshTxBuilder({
    fetcher,
    evaluator,
  });
  // Contributing to crowdfund
  const utxos = await wallet.getUtxosMesh();
  const walletAddress = await wallet.getChangeAddressBech32();
  if (!walletAddress) {
    throw new Error("Wallet address not found");
  }
  const collateral = await wallet.getCollateralMesh();
  if (collateral.length === 0) {
    throw new Error("No collateral available in the wallet");
  }
  const txHex = await txBuilder
    .selectUtxosFrom(utxos)
    .txInCollateral(collateral[0].input.txHash, collateral[0].input.outputIndex)
    .spendingPlutusScriptV3()
    .txIn(proposalInfo.utxo.input.txHash, proposalInfo.utxo.input.outputIndex)
    .txInRedeemerValue(conStr0([]), "JSON")
    .txInInlineDatumPresent()
    .spendingTxInReference(
      proposalInfo.utxo.input.txHash,
      proposalInfo.utxo.input.outputIndex + 1,
    )
    .txOut(
      proposalInfo.utxo.output.address,
      MeshValue.fromAssets(proposalInfo.utxo.output.amount)
        .addAsset({ unit: "lovelace", quantity: contributeAmount.toString() })
        .toAssets(),
    )
    .txOutInlineDatumValue(newDatum, "JSON")
    .mintPlutusScriptV3()
    .mint(contributeAmount.toString(), proposalInfo.scripts.shareToken.hash, "")
    .mintingScript(proposalInfo.scripts.shareToken.cbor)
    .mintRedeemerValue(conStr0([]), "JSON")
    .txOut(walletAddress, [
      {
        unit: "lovelace",
        quantity: "2000000",
      },
      {
        unit: `${proposalInfo.scripts.shareToken.hash}`,
        quantity: contributeAmount.toString(),
      },
    ])
    .invalidHereafter(latestBlock.slot + 30)
    .changeAddress(walletAddress)
    .complete();
  const signedTx = await wallet.signTxReturnFullTx(txHex);
  let txHash;
  try {
    txHash = await submitter.submitTx(signedTx);
    console.log("Transaction submitted with hash:", txHash);
  } catch (e) {
    console.error("Failed to submit transaction:", e);
    throw e;
  }
};
