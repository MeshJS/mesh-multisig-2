import blueprint from "../aiken-scripts/gov-crowdfundV2/plutus.json";

import {
  OutputReference,
  ConStr0,
  ConStr1,
  MintingBlueprint,
  PolicyId,
  ByteString,
  ConStr2,
  ConStr,
  Credential,
  PubKeyAddress,
  ScriptAddress,
  Integer,
  Bool,
  SpendingBlueprint,
  WithdrawalBlueprint,
} from "@meshsdk/core";

const version = "V3";
const networkId = 0; // 0 for testnet; 1 for mainnet

export class GcfAuthMintMintBlueprint extends MintingBlueprint {
  compiledCode: string;

  constructor(params: [OutputReference]) {
    const compiledCode = blueprint.validators[0]!.compiledCode;
    super(version);
    this.compiledCode = compiledCode;
    this.paramScript(compiledCode, params, "JSON");
  }

  params = (data: [OutputReference]): [OutputReference] => data;
}

export class GcfSpendSpendBlueprint extends SpendingBlueprint {
  compiledCode: string;

  constructor(
    params: [
      PolicyId,
      ByteString,
      ByteString,
      ByteString,
      Lovelace,
      Lovelace,
      Lovelace,
    ],
    stakeKeyHash: string,
    isStakeScriptCredential: boolean,
  ) {
    const compiledCode = blueprint.validators[2]!.compiledCode;
    super(version, networkId, stakeKeyHash, isStakeScriptCredential);
    this.compiledCode = compiledCode;
    this.paramScript(compiledCode, params, "JSON");
  }

  params = (
    data: [
      PolicyId,
      ByteString,
      ByteString,
      ByteString,
      Lovelace,
      Lovelace,
      Lovelace,
    ],
  ): [
    PolicyId,
    ByteString,
    ByteString,
    ByteString,
    Lovelace,
    Lovelace,
    Lovelace,
  ] => data;
  datum = (data: CrowdfundGovDatum): CrowdfundGovDatum => data;
  redeemer = (data: CrowdfundGovRedeemer): CrowdfundGovRedeemer => data;
}

export class GcfStakePublishBlueprint extends WithdrawalBlueprint {
  compiledCode: string;

  constructor(params: [PolicyId]) {
    const compiledCode = blueprint.validators[4]!.compiledCode;
    super(version, networkId);
    this.compiledCode = compiledCode;
    this.paramScript(compiledCode, params, "JSON");
  }

  params = (data: [PolicyId]): [PolicyId] => data;
}

export class GcfStakeWithdrawBlueprint extends WithdrawalBlueprint {
  compiledCode: string;

  constructor(params: [PolicyId]) {
    const compiledCode = blueprint.validators[7]!.compiledCode;
    super(version, networkId);
    this.compiledCode = compiledCode;
    this.paramScript(compiledCode, params, "JSON");
  }

  params = (data: [PolicyId]): [PolicyId] => data;
}

export class ShareTokenMintBlueprint extends MintingBlueprint {
  compiledCode: string;

  constructor(params: [PolicyId]) {
    const compiledCode = blueprint.validators[9]!.compiledCode;
    super(version);
    this.compiledCode = compiledCode;
    this.paramScript(compiledCode, params, "JSON");
  }

  params = (data: [PolicyId]): [PolicyId] => data;
}

export type MintPolarity = RMint | RBurn;

export type RMint = ConStr0<[]>;

export type RBurn = ConStr1<[]>;

export type Lovelace = Integer;

export type CrowdfundGovRedeemer =
  | ContributeFund
  | ContributorWithdrawal
  | RegisterCerts
  | ProposeGovAction
  | VoteOnGovAction
  | DeregisterCerts
  | RemoveEmptyInstance;

export type ContributeFund = ConStr0<[]>;

export type ContributorWithdrawal = ConStr1<[]>;

export type RegisterCerts = ConStr2<[]>;

export type ProposeGovAction = ConStr<3, []>;

export type VoteOnGovAction = ConStr<4, []>;

export type DeregisterCerts = ConStr<5, []>;

export type RemoveEmptyInstance = ConStr<6, []>;

export type CrowdfundGovDatum = Crowdfund | Proposed | Voted | Refundable;

export type Crowdfund = ConStr0<
  [
    Credential,
    ByteString,
    PubKeyAddress | ScriptAddress,
    Integer,
    Integer,
    Bool,
    Integer,
    Integer,
    Integer,
  ]
>;

export type Proposed = ConStr1<[Credential, ByteString, Integer, Integer]>;

export type Voted = ConStr2<
  [Credential, ByteString, Integer, GovernanceActionId, Integer]
>;

export type GovernanceActionId = ConStr0<[ByteString, Integer]>;

export type TransactionId = ByteString;

export type Index = Integer;

export type Refundable = ConStr<3, [Credential, ByteString, Integer]>;

export type PublishRedeemer = Register | Deregister;

export type Register = ConStr0<[]>;

export type Deregister = ConStr1<[]>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Data = any;
