import { Crowdfund, CrowdfundGovDatum } from "@/types/gcf-spend";
import {
  conStr0,
  IEvaluator,
  IFetcher,
  ISubmitter,
  MeshTxBuilder,
  MeshValue,
  UTxO,
} from "@meshsdk/core";
import { fromPlutusDataToJson, PlutusData } from "@meshsdk/core-cst";
import { MeshCardanoHeadlessWallet } from "@meshsdk/wallet";

export type ProposalInfo = {
  utxo: UTxO;
  fundedAmount: number | bigint;
  requiredFunding: number | bigint;
  deadline: number | bigint;
  scripts: {
    initialTxHashIndex: {
      txHash: string;
      txIndex: number;
    };
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
  const previousCrowdfundStatus: Crowdfund = previousDatum
    .fields[0] as unknown as Crowdfund;
  const newCrowdfundStatus: Crowdfund = conStr0([
    previousCrowdfundStatus.fields[0],
    previousCrowdfundStatus.fields[1],
    previousCrowdfundStatus.fields[2],
    previousCrowdfundStatus.fields[3],
    {
      int:
        BigInt(previousCrowdfundStatus.fields[4]?.int ?? 0) +
        BigInt(contributeAmount),
    },
    previousCrowdfundStatus.fields[5],
    previousCrowdfundStatus.fields[6],
    previousCrowdfundStatus.fields[7],
    previousCrowdfundStatus.fields[8],
  ]);
  const newDatum: CrowdfundGovDatum = conStr0([
    newCrowdfundStatus,
    previousDatum.fields[1],
  ]) as unknown as CrowdfundGovDatum;

  const txBuilder = new MeshTxBuilder({
    fetcher,
    evaluator,
  });
  // Contributing to crowdfund
  const utxos = await wallet.getUtxosMesh();
  const collaterals = utxos.filter((u) =>
    u.output.amount.some(
      (a) => a.unit === "lovelace" && BigInt(a.quantity) >= 5000000,
    ),
  );
  if (collaterals.length === 0) {
    throw new Error(
      "No utxos larger than 5 ADA available in the wallet for collateral",
    );
  }
  const walletAddress = await wallet.getChangeAddressBech32();
  if (!walletAddress) {
    throw new Error("Wallet address not found");
  }

  // Get script ref from local storage
  const scriptRef = localStorage.getItem("scriptRef");
  if (!scriptRef) {
    throw new Error("Script reference not found in local storage");
  }
  const txHex = await txBuilder
    .selectUtxosFrom(utxos)
    .txInCollateral(
      collaterals[0].input.txHash,
      collaterals[0].input.outputIndex,
    )
    .spendingPlutusScriptV3()
    .txIn(proposalInfo.utxo.input.txHash, proposalInfo.utxo.input.outputIndex)
    .txInRedeemerValue(conStr0([]), "JSON")
    .txInInlineDatumPresent()
    .spendingTxInReference(scriptRef, 0)
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
    .setTotalCollateral("5000000")
    .invalidHereafter(latestBlock.slot + 30)
    .changeAddress(walletAddress)
    .complete();
  const signedTx = await wallet.signTxReturnFullTx(txHex);
  let txHash: string;
  try {
    txHash = await submitter.submitTx(signedTx);
    console.log("Transaction submitted with hash:", txHash);

    const savedProposalTxHashes = localStorage.getItem("proposalTxHashes");
    const parsedProposalTxHashes: string[] = savedProposalTxHashes
      ? (JSON.parse(savedProposalTxHashes) as string[])
      : [];
    const updatedProposalTxHashes = parsedProposalTxHashes.map((hash) =>
      hash === proposalInfo.utxo.input.txHash ? txHash : hash,
    );
    localStorage.setItem(
      "proposalTxHashes",
      JSON.stringify(updatedProposalTxHashes),
    );
  } catch (e) {
    console.error("Failed to submit transaction:", e);
    throw e;
  }

  return txHash;
};
