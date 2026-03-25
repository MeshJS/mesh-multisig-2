import { afterEach, before, describe, it } from "node:test";
import {
  conStr,
  conStr0,
  conStr1,
  conStr2,
  conStr3,
  hashDrepAnchor,
  MeshTxBuilder,
  UTxO,
} from "@meshsdk/core";
import { AddressType, MeshCardanoHeadlessWallet } from "@meshsdk/wallet";
import {
  CrowdfundTestUtils,
  drepRegisterDeposit,
  mockPoolId,
  stakeRegisterDeposit,
  YaciProvider2,
} from "./test-utils";
import { fromBuilderToPlutusData } from "@meshsdk/core-cst";

describe("Yaci Crowdfund Contribute", async () => {
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  const provider = new YaciProvider2("http://localhost:8080/api/v1");
  let providerAvailable = true;

  let wallet: MeshCardanoHeadlessWallet;
  let walletAddress = "";
  let utxos: UTxO[] = [];

  before(async () => {
    try {
      await provider.get("/blocks/latest");
    } catch (error) {
      providerAvailable = false;
      console.warn(
        "Skipping Yaci Crowdfund Contribute tests because the provider is unavailable.",
        error,
      );
      return;
    }

    wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
      networkId: 0,
      fetcher: provider,
      walletAddressType: AddressType.Base,
      mnemonic: [
        "horror",
        "hand",
        "pulp",
        "market",
        "slight",
        "photo",
        "frown",
        "pulp",
        "crawl",
        "day",
        "senior",
        "property",
        "calm",
        "inner",
        "reflect",
        "stage",
        "spot",
        "before",
        "charge",
        "artist",
        "together",
        "heavy",
        "quote",
        "soup",
      ],
    });

    walletAddress = await wallet.getChangeAddressBech32();
    utxos = await wallet.getUtxosMesh();
  });

  const skipIfProviderUnavailable = (t: {
    skip: (message?: string) => void;
  }) => {
    if (!providerAvailable) {
      t.skip("Provider unavailable");
      return true;
    }

    return false;
  };

  const initialTxHash =
    "a9aa2fcfed0ccf5363eca9c855769e5ffbf7e9d11d2569fd6905fa3f54b4af32";
  const initialTxIndex = 0;
  const testUtils = new CrowdfundTestUtils(initialTxHash, initialTxIndex);
  const infoActionJson = conStr(6, []);
  const infoActionHash = fromBuilderToPlutusData({
    type: "JSON",
    content: infoActionJson,
  }).hash();
  const authTokenPolicyIdValue = testUtils.authTokenPolicyId();
  const authTokenScriptValue = testUtils.authTokenScript();
  const crowdfundScriptValue = testUtils.crowdfundScriptCustomGovDeposit(
    infoActionHash,
    1000000000,
  );
  const shareTokenScriptValue = testUtils.shareTokenScript();
  const stakeHashValue = testUtils.stakeHash();
  const rewardAddressValue = testUtils.rewardAddress();
  const drepIdValue = testUtils.drepId();
  const crowdfundStakeScriptValue = testUtils.crowdfundStakeScript();
  const deadline = Date.now() + 10000;
  let lastSubmitted: string =
    "a8c1641a9bdcaec0793ef1498e8bf965ea33bdecb77d3db19e477bc4c143a201";
  const totalDeposit = stakeRegisterDeposit + drepRegisterDeposit + 1000000000;
  let gcfRefInput: {
    txHash: string;
    outputIndex: number;
  } = {
    txHash: "",
    outputIndex: 0,
  };

  let proposalId: {
    txHash: string;
    proposalIndex: number;
  } = {
    txHash: "",
    proposalIndex: 0,
  };

  let shareTokenInput: {
    txHash: string;
    outputIndex: number;
  } = {
    txHash: "",
    outputIndex: 0,
  };

  it("should mint authority tokens to script", async (t) => {
    if (skipIfProviderUnavailable(t)) return;

    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
    });
    // Mint the auth token to the script address
    const txHex = await txBuilder
      .selectUtxosFrom(utxos)
      .mintPlutusScriptV3()
      .mint("1", authTokenPolicyIdValue, "")
      .mintRedeemerValue(conStr0([]), "JSON")
      .mintingScript(authTokenScriptValue.cbor)
      .txOut(crowdfundScriptValue.address, [
        { unit: "lovelace", quantity: "2000000" },
        {
          unit: authTokenPolicyIdValue,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(
        crowdfundScriptValue.datum(
          conStr0([
            conStr1([{ bytes: stakeHashValue }]),
            { bytes: shareTokenScriptValue.hash },
            conStr0([
              conStr1([{ bytes: crowdfundScriptValue.hash }]),
              conStr1([]),
            ]),
            { int: totalDeposit },
            { int: 0 },
            conStr0([]),
            { int: deadline },
            { int: 0 },
            { int: 0 },
          ]),
        ),
        "JSON",
      )
      .txOut(walletAddress, [])
      .txOutReferenceScript(crowdfundScriptValue.cbor)
      .txInCollateral(utxos[0].input.txHash, utxos[0].input.outputIndex)
      .changeAddress(walletAddress)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);
    const txHash = await provider.submitTx(signedTx);
    gcfRefInput = {
      txHash,
      outputIndex: 1,
    };
    lastSubmitted = txHash;
  });

  it("should contribute to a crowdfund", async (t) => {
    if (skipIfProviderUnavailable(t)) return;

    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
    });
    // Contributing to crowdfund
    const contributeAmount = totalDeposit;
    const latestBlock = await provider.get("/blocks/latest");
    const txHex = await txBuilder
      .txIn(lastSubmitted, 2)
      .txInCollateral(lastSubmitted, 2)
      .spendingPlutusScriptV3()
      .txIn(lastSubmitted, 0)
      .txInRedeemerValue(conStr0([]), "JSON")
      .txInInlineDatumPresent()
      .spendingTxInReference(gcfRefInput.txHash, gcfRefInput.outputIndex)
      .txOut(crowdfundScriptValue.address, [
        {
          unit: "lovelace",
          quantity: (2000000 + contributeAmount).toString(),
        },
        {
          unit: authTokenPolicyIdValue,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(
        crowdfundScriptValue.datum(
          conStr0([
            conStr1([{ bytes: stakeHashValue }]),
            { bytes: shareTokenScriptValue.hash },
            conStr0([
              conStr1([{ bytes: crowdfundScriptValue.hash }]),
              conStr1([]),
            ]),
            { int: totalDeposit },
            { int: contributeAmount },
            conStr0([]),
            { int: deadline },
            { int: 0 },
            { int: 0 },
          ]),
        ),
        "JSON",
      )
      .mintPlutusScriptV3()
      .mint(contributeAmount.toString(), shareTokenScriptValue.hash, "")
      .mintingScript(shareTokenScriptValue.cbor)
      .mintRedeemerValue(conStr0([]), "JSON")
      .txOut(walletAddress, [
        {
          unit: "lovelace",
          quantity: "2000000",
        },
        {
          unit: `${shareTokenScriptValue.hash}`,
          quantity: contributeAmount.toString(),
        },
      ])
      .invalidHereafter(latestBlock.slot + 30)
      .changeAddress(walletAddress)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);
    let txHash;
    try {
      txHash = await provider.submitTx(signedTx);
    } catch (e) {
      console.error("Failed to submit transaction:", e);
      throw e;
    }
    lastSubmitted = txHash;
    shareTokenInput = {
      txHash,
      outputIndex: 1,
    };
  });

  it("should register stake for the crowdfund", async (t) => {
    if (skipIfProviderUnavailable(t)) return;

    const contributeAmount = totalDeposit;
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
    });

    // Register DRep, Stake, Delegate and vote
    const txHex = await txBuilder
      .txIn(lastSubmitted, 2)
      .txInCollateral(lastSubmitted, 2)
      .spendingPlutusScriptV3()
      .txIn(lastSubmitted, 0)
      .txInRedeemerValue(conStr(2, []), "JSON")
      .txInInlineDatumPresent()
      .spendingTxInReference(gcfRefInput.txHash, gcfRefInput.outputIndex)
      .txOut(crowdfundScriptValue.address, [
        {
          unit: "lovelace",
          quantity: (
            2000000 +
            contributeAmount -
            stakeRegisterDeposit -
            drepRegisterDeposit
          ).toString(),
        },
        {
          unit: authTokenPolicyIdValue,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(
        crowdfundScriptValue.datum(
          conStr0([
            conStr1([{ bytes: stakeHashValue }]),
            { bytes: shareTokenScriptValue.hash },
            conStr0([
              conStr1([{ bytes: crowdfundScriptValue.hash }]),
              conStr1([]),
            ]),
            { int: totalDeposit },
            { int: contributeAmount },
            conStr0([]),
            { int: deadline },
            { int: 0 },
            { int: 0 },
          ]),
        ),
        "JSON",
      )
      .registerStakeCertificate(rewardAddressValue)
      .drepRegistrationCertificate(drepIdValue)
      .certificateScript(crowdfundStakeScriptValue.cbor, "V3")
      .certificateRedeemerValue(conStr0([]), "JSON", {
        mem: 152103,
        steps: 53714095,
      })
      .voteDelegationCertificate(
        {
          dRepId: drepIdValue,
        },
        rewardAddressValue,
      )
      .certificateScript(crowdfundStakeScriptValue.cbor, "V3")
      .certificateRedeemerValue(conStr0([]), "JSON", {
        mem: 152103,
        steps: 53714095,
      })
      .delegateStakeCertificate(rewardAddressValue, mockPoolId)
      .certificateScript(crowdfundStakeScriptValue.cbor, "V3")
      .certificateRedeemerValue(conStr0([]), "JSON", {
        mem: 152103,
        steps: 53714095,
      })
      .changeAddress(walletAddress)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);
    let txHash;
    try {
      txHash = await provider.submitTx(signedTx);
    } catch (e) {
      console.error("Failed to submit transaction:", e);
      throw e;
    }
    lastSubmitted = txHash;
  });

  it("should allow proposing an info action", async (t) => {
    if (skipIfProviderUnavailable(t)) return;

    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
    });

    const txHex = await txBuilder
      .txIn(lastSubmitted, 1)
      .txInCollateral(lastSubmitted, 1)
      .spendingPlutusScriptV3()
      .txIn(lastSubmitted, 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue(conStr3([]), "JSON")
      .spendingTxInReference(gcfRefInput.txHash, gcfRefInput.outputIndex)
      .txOut(crowdfundScriptValue.address, [
        {
          unit: "lovelace",
          quantity: (2000000).toString(),
        },
        {
          unit: authTokenPolicyIdValue,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(
        crowdfundScriptValue.datum(
          conStr1([
            conStr1([{ bytes: stakeHashValue }]),
            { bytes: shareTokenScriptValue.hash },
            { int: totalDeposit },
            { int: deadline },
          ]),
        ),
        "JSON",
      )
      .proposal(
        { action: {}, kind: "InfoAction" },
        { anchorDataHash: hashDrepAnchor({}), anchorUrl: "" },
        rewardAddressValue,
        "1000000000",
      )
      .changeAddress(walletAddress)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);
    let txHash;
    try {
      txHash = await provider.submitTx(signedTx);
    } catch (e) {
      console.error("Failed to submit transaction:", e);
      throw e;
    }
    proposalId = {
      txHash,
      proposalIndex: 0,
    };
    lastSubmitted = txHash;
  });

  it("should allow voting on proposal", async (t) => {
    if (skipIfProviderUnavailable(t)) return;

    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
    });

    const txHex = await txBuilder
      .txIn(lastSubmitted, 1)
      .txInCollateral(lastSubmitted, 1)
      .spendingPlutusScriptV3()
      .txIn(lastSubmitted, 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue(conStr(4, []), "JSON")
      .spendingTxInReference(gcfRefInput.txHash, gcfRefInput.outputIndex)
      .txOut(crowdfundScriptValue.address, [
        {
          unit: "lovelace",
          quantity: (2000000).toString(),
        },
        {
          unit: authTokenPolicyIdValue,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(
        crowdfundScriptValue.datum(
          conStr2([
            conStr1([{ bytes: stakeHashValue }]),
            { bytes: shareTokenScriptValue.hash },
            { int: totalDeposit },
            conStr0([
              { bytes: proposalId.txHash },
              { int: proposalId.proposalIndex },
            ] as [{ bytes: string }, { int: number }]),
            { int: deadline },
          ]),
        ),
        "JSON",
      )
      .votePlutusScriptV3()
      .vote(
        {
          type: "DRep",
          drepId: drepIdValue,
        },
        {
          txHash: proposalId.txHash,
          txIndex: proposalId.proposalIndex,
        },
        {
          voteKind: "Yes",
        },
      )
      .voteRedeemerValue(conStr0([]), "JSON")
      .voteScript(crowdfundStakeScriptValue.cbor)
      .changeAddress(walletAddress)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);
    let txHash;
    try {
      txHash = await provider.submitTx(signedTx);
    } catch (e) {
      console.error("Failed to submit transaction:", e);
      throw e;
    }
    lastSubmitted = txHash;
  });

  it("should allow withdrawal of expired governance deposit", async (t) => {
    if (skipIfProviderUnavailable(t)) return;

    await new Promise((resolve) => setTimeout(resolve, 20000));
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
    });
    const latestBlock = await provider.get("/blocks/latest");
    const accountInfo = await provider.fetchAccountInfo(rewardAddressValue);
    const txHex = await txBuilder
      .txIn(lastSubmitted, 1)
      .txInCollateral(lastSubmitted, 1)
      .spendingPlutusScriptV3()
      .txIn(lastSubmitted, 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue(conStr(5, []), "JSON")
      .spendingTxInReference(gcfRefInput.txHash, gcfRefInput.outputIndex)
      .txOut(crowdfundScriptValue.address, [
        {
          unit: "lovelace",
          quantity: (
            2000000 +
            1000000000 +
            drepRegisterDeposit +
            stakeRegisterDeposit
          ).toString(),
        },
        {
          unit: authTokenPolicyIdValue,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(
        crowdfundScriptValue.datum(
          conStr3([
            conStr1([{ bytes: stakeHashValue }]),
            { bytes: shareTokenScriptValue.hash },
            { int: totalDeposit },
          ]),
        ),
        "JSON",
      )
      .withdrawalPlutusScriptV3()
      .withdrawal(rewardAddressValue, accountInfo.rewards)
      .withdrawalRedeemerValue(conStr0([]), "JSON")
      .withdrawalScript(crowdfundStakeScriptValue.cbor)
      .deregisterStakeCertificate(rewardAddressValue)
      .certificateScript(crowdfundStakeScriptValue.cbor, "V3")
      .certificateRedeemerValue(conStr1([]), "JSON", {
        mem: 152103,
        steps: 53714095,
      })
      .drepDeregistrationCertificate(drepIdValue, String(drepRegisterDeposit))
      .certificateScript(crowdfundStakeScriptValue.cbor, "V3")
      .certificateRedeemerValue(conStr1([]), "JSON", {
        mem: 152103,
        steps: 53714095,
      })
      .invalidBefore(latestBlock.slot - 5)
      .changeAddress(walletAddress)
      .complete();
    const signedTx = await wallet.signTxReturnFullTx(txHex);
    let txHash;
    try {
      txHash = await provider.submitTx(signedTx);
    } catch (e) {
      console.error("Failed to submit transaction:", e);
      throw e;
    }
    lastSubmitted = txHash;
  });

  it("should allow crowdfund refund", async (t) => {
    if (skipIfProviderUnavailable(t)) return;
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
    });

    // Crowdfund refund after deadline with no proposal passed
    const contributeAmount = totalDeposit;
    const txHex = await txBuilder
      .txIn(lastSubmitted, 1)
      .txInCollateral(lastSubmitted, 1)
      .txIn(shareTokenInput.txHash, shareTokenInput.outputIndex)
      .spendingPlutusScriptV3()
      .txIn(lastSubmitted, 0)
      .txInRedeemerValue(conStr1([]), "JSON")
      .txInInlineDatumPresent()
      .spendingTxInReference(gcfRefInput.txHash, gcfRefInput.outputIndex)
      .txOut(crowdfundScriptValue.address, [
        {
          unit: "lovelace",
          quantity: (2000000).toString(),
        },
        {
          unit: authTokenPolicyIdValue,
          quantity: "1",
        },
      ])
      .txOutInlineDatumValue(
        crowdfundScriptValue.datum(
          conStr3([
            conStr1([{ bytes: stakeHashValue }]),
            { bytes: shareTokenScriptValue.hash },
            { int: 0 },
          ]),
        ),
        "JSON",
      )
      .mintPlutusScriptV3()
      .mint((-contributeAmount).toString(), shareTokenScriptValue.hash, "")
      .mintingScript(shareTokenScriptValue.cbor)
      .mintRedeemerValue(conStr1([]), "JSON")
      .changeAddress(walletAddress)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);
    let txHash;
    try {
      txHash = await provider.submitTx(signedTx);
    } catch (e) {
      console.error("Failed to submit transaction:", e);
      throw e;
    }
    lastSubmitted = txHash;
  });
});
