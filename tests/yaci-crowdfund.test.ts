import { afterEach, describe, it } from "node:test";
import {
  conStr,
  conStr0,
  conStr1,
  conStr3,
  hashDrepAnchor,
  MeshTxBuilder,
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

  const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
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

  const walletAddress = await wallet.getChangeAddressBech32();
  const utxos = await wallet.getUtxosMesh();

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
  const deadline = 1783046375000;
  let lastSubmitted: string =
    "68bbcc14c5267d375745afbec658fc3a0adccb7985ec868c0fc67731fd1defa7";
  const totalDeposit = stakeRegisterDeposit + drepRegisterDeposit + 1000000000;

  it("should mint authority tokens to script", async () => {
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
      .txInCollateral(utxos[0].input.txHash, utxos[0].input.outputIndex)
      .changeAddress(walletAddress)
      .complete();

    const signedTx = await wallet.signTxReturnFullTx(txHex);
    const txHash = await provider.submitTx(signedTx);
    lastSubmitted = txHash;
  });

  it("should contribute to a crowdfund", async () => {
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
    });
    // Contributing to crowdfund
    const contributeAmount = totalDeposit;
    const latestBlock = await provider.get("/blocks/latest");
    const txHex = await txBuilder
      .txIn(lastSubmitted, 1)
      .txInCollateral(lastSubmitted, 1)
      .spendingPlutusScriptV3()
      .txIn(lastSubmitted, 0)
      .txInRedeemerValue(conStr0([]), "JSON")
      .txInInlineDatumPresent()
      .txInScript(crowdfundScriptValue.cbor)
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
  });

  it("should register stake for the crowdfund", async () => {
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
      .txInScript(crowdfundScriptValue.cbor)
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

  it("should allow proposing an info action", async () => {
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
      .txInScript(crowdfundScriptValue.cbor)
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
    lastSubmitted = txHash;
  });

  it("should allow withdrawal of governance deposit", async () => {
    await new Promise((resolve) => setTimeout(resolve, 20000));
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      evaluator: provider,
    });

    const accountInfo = await provider.fetchAccountInfo(rewardAddressValue);
    const txHex = await txBuilder
      .txIn(lastSubmitted, 1)
      .txInCollateral(lastSubmitted, 1)
      .spendingPlutusScriptV3()
      .txIn(lastSubmitted, 0)
      .txInInlineDatumPresent()
      .txInRedeemerValue(conStr(5, []), "JSON")
      .txInScript(crowdfundScriptValue.cbor)
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
      .withdrawalPlutusScriptV3()
      .withdrawal(rewardAddressValue, accountInfo.rewards)
      .withdrawalRedeemerValue(conStr0([]), "JSON")
      .withdrawalScript(crowdfundStakeScriptValue.cbor)
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
